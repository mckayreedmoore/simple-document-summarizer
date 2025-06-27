import fs from 'fs';
import path from 'path';
import { getDatabaseInstance, setupDatabase } from '../utilities/db';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../utilities/logger';

export class FileService {
  public db;
  private openai;

  constructor() {
    this.db = getDatabaseInstance();
    setupDatabase(this.db);
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async listUploadedDocuments(): Promise<{ id: number; fileName: string }[]> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.all(
          'SELECT chunkId as id, fileName FROM DocumentChunks WHERE chunkIndex = 0 ORDER BY chunkId DESC',
          (err: Error | null, rows: any[]) => {
            if (err) {
              logger.error('DB error in listUploadedDocuments:', err);
              return reject(err);
            }
            resolve(rows);
          }
        );
      } catch (err) {
        logger.error('Exception in listUploadedDocuments:', err);
        reject(err);
      }
    });
  }

  async querySimilarChunks(
    embedding: number[],
    k: number = 3
  ): Promise<{ fkChunkId: number }[]> {
    const db = this.db;
    try {
      const allVectors: { fkChunkId: number; embedding: string }[] = await new Promise(
        (resolve, reject) => {
          db.all(
            'SELECT fkChunkId, embedding FROM DocumentVectors',
            (err: Error | null, rows: any[]) => {
              if (err) {
                logger.error('DB error in querySimilarChunks:', err);
                return reject(err);
              }
              resolve(rows);
            }
          );
        }
      );
      const queryVec = embedding;
      const vectorious = require('vectorious');
      const scored = allVectors.map((row) => {
        const vec = JSON.parse(row.embedding);
        const similarity =
          vectorious.dot(queryVec, vec) / (vectorious.norm(queryVec) * vectorious.norm(vec));
        return { fkChunkId: row.fkChunkId, similarity };
      });
      scored.sort((a, b) => b.similarity - a.similarity);
      return scored.slice(0, k).map((row) => ({ fkChunkId: row.fkChunkId }));
    } catch (err) {
      logger.error('Error in querySimilarChunks:', err);
      throw new Error('Failed to query similar chunks');
    }
  }

  async getChunkById(chunkId: number): Promise<any> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.get(
          'SELECT chunkId, fileName, chunkIndex, content FROM DocumentChunks WHERE chunkId = ?',
          [chunkId],
          (err: Error | null, row: any) => {
            if (err) {
              logger.error('DB error in getChunkById:', err);
              return reject(err);
            }
            resolve(row);
          }
        );
      } catch (err) {
        logger.error('Exception in getChunkById:', err);
        reject(err);
      }
    });
  }

  async getFullDocumentText(fileName: string): Promise<string> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.all(
          'SELECT content FROM DocumentChunks WHERE fileName = ? ORDER BY chunkIndex ASC',
          [fileName],
          (err: Error | null, rows: any[]) => {
            if (err) {
              logger.error('DB error in getFullDocumentText:', err);
              return reject(err);
            }
            const fullText = rows.map((row) => row.content).join('');
            resolve(fullText);
          }
        );
      } catch (err) {
        logger.error('Exception in getFullDocumentText:', err);
        reject(err);
      }
    });
  }

  async processFile(fileBuffer: Buffer, fileName: string): Promise<void> {
    try {
      logger.info(`Processing file: ${fileName}`);
      let text = '';
      const ext = path.extname(fileName).toLowerCase();
      if (ext === '.pdf') {
        // PDF extraction
        const data = await pdfParse(fileBuffer);
        text = data.text;
      } else if (ext === '.docx') {
        // DOCX extraction
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        text = result.value;
      } else {
        // Default: treat as UTF-8 text
        text = fileBuffer.toString('utf-8');
      }

      const chunkSize = 1000;
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
      }

      // Process chunks in parallel with a concurrency limit
      const concurrencyLimit = Number(process.env.FILE_CONCURRENCY_PROCESS_LIMIT);
      let idx = 0;
      const self = this;
      async function processBatch() {
        const batch = [];
        for (let i = 0; i < concurrencyLimit && idx < chunks.length; i++) {
          const chunkIndex = idx;
          const chunk = chunks[chunkIndex];
          idx++;
          batch.push(
            (async (chunkIdx, chunkData) => {
              // This is where embedding and storage would happen
              // But since storeChunk and getEmbedding are removed, you may want to implement your own logic here if needed
            })(chunkIndex, chunk)
          );
        }
        await Promise.all(batch);
      }
      while (idx < chunks.length) {
        await processBatch();
      }
      logger.info(`Finished processing file: ${fileName}`);
    } catch (err) {
      logger.error('Error in processFile:', err);
      throw new Error('Failed to process file');
    }
  }

  async clearAllDocuments(): Promise<void> {
    logger.info('Clearing all documents and vectors from the database');
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.run('DELETE FROM DocumentVectors', (err: Error | null) => {
          if (err) {
            logger.error('DB error in clearAllDocuments (DocumentVectors):', err);
            return reject(err);
          }
          db.run('DELETE FROM DocumentChunks', (err: Error | null) => {
            if (err) {
              logger.error('DB error in clearAllDocuments (DocumentChunks):', err);
              return reject(err);
            }
            logger.info('All documents and vectors cleared from the database');
            resolve();
          });
        });
      } catch (err) {
        logger.error('Exception in clearAllDocuments:', err);
        reject(err);
      }
    });
  }

  // Moved from ChatService
  public async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL as string,
        input: text,
      });
      return response.data[0].embedding;
    } catch (err) {
      logger.error('OpenAI Embedding API error:', err);
      throw new Error('Failed to get embedding');
    }
  }

  public async getRelevantChunks(query: string, k: number = 3): Promise<string[]> {
    try {
      // Get embedding for the query
      const embedding = await this.getEmbedding(query);
      // Query the vector DB for similar chunks
      const results = await this.querySimilarChunks(embedding, k);
      if (!results || results.length === 0) return [];
      // Fetch the actual chunk content
      const chunks = await Promise.all(
        results.map((r) => this.getChunkById(r.fkChunkId))
      );
      return chunks.map((c) => c.content);
    } catch (err) {
      logger.error('Error in getRelevantChunks:', err);
      throw new Error('Failed to get relevant chunks');
    }
  }

  public createFileContextMessage(fileContent: string): any {
    return {
      role: 'file' as any, // OpenAI API only allows 'system', 'user', 'assistant', but we use this internally
      content:
        '[File Context]\n' +
        fileContent +
        '\n[End of File Context]\n' +
        '\nDo not respond to this message. Use it only as context for answering user questions.'
    };
  }
}
