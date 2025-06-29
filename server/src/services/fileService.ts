import fs from 'fs';
import path from 'path';
import { getDatabaseInstance } from '../utilities/db';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import { logger } from '../utilities/logger';
import type { File } from '../models/file';
import { dot, norm } from 'vectorious';

export class FileService {
  private openai: OpenAI;
  private readonly db;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.db = getDatabaseInstance();
  }

  async listUploadedFiles(): Promise<File[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `
        SELECT fileId, fileName
        FROM Files
        ORDER BY fileId DESC
        `,
        (err: Error | null, rows: any[]) => {
          if (err) {
            logger.error('DB error in listUploadedFiles:', err);
            return reject(err);
          }
          const files: File[] = rows.map((row) => ({
            fileId: row.fileId,
            fileName: row.fileName,
          }));
          resolve(files);
        }
      );
    });
  }

  async querySimilarChunks(embedding: number[], k: number): Promise<{ fkChunkId: number }[]> {
    try {
      const allVectors: { fkChunkId: number; embedding: string }[] = await new Promise(
        (resolve, reject) => {
          this.db.all(
            'SELECT fkChunkId, embedding FROM FileVectors',
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
      if (!allVectors || allVectors.length === 0) {
        return [];
      }
      const queryVec = embedding;
      const scored = allVectors.map((row) => {
        const vec = JSON.parse(row.embedding);
        const similarity = dot(queryVec, vec) / (norm(queryVec) * norm(vec));
        return { fkChunkId: row.fkChunkId, similarity };
      });
      scored.sort((a, b) => b.similarity - a.similarity);
      return scored.slice(0, k).map((row) => ({ fkChunkId: row.fkChunkId }));
    } catch (err) {
      logger.error('Error in querySimilarChunks:', err);
      throw new Error('Failed to query similar chunks');
    }
  }

  async getChunkById(fileChunkId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `
        SELECT content
        FROM FileChunks
        WHERE fileChunkId = ?
        `,
        [fileChunkId],
        (err: Error | null, row: any) => {
          if (err) {
            logger.error('DB error in getChunkById:', err);
            return reject(err);
          }
          resolve(row);
        }
      );
    });
  }

  private async extractTextFromFile(fileBuffer: Buffer, fileName: string): Promise<string> {
    const ext = path.extname(fileName).toLowerCase();

    // PDF
    if (ext === '.pdf') {
      if (fileBuffer.toString('utf-8', 0, 4) !== '%PDF') {
        logger.warn('File content does not match PDF signature');
        throw new Error('File content does not match PDF signature');
      }
      const data = await pdfParse(fileBuffer);
      return data.text;
    }

    // DOCX
    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    }

    // Plain text types
    if (['.txt', '.md', '.json', '.log', '.csv'].includes(ext)) {
      return fileBuffer.toString('utf-8');
    }

    logger.warn('Unsupported file extension in extractTextFromFile');
    throw new Error('Unsupported file extension');
  }

  private async insertChunksAndGetIds(fileName: string, chunks: string[]): Promise<number[]> {
    const fileId: number = await new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO Files (fileName) VALUES (?)',
        [fileName],
        (err: Error | null) => {
          if (err) {
            logger.error('DB error in insertChunksAndGetIds (insert file):', err);
            return reject(err);
          }
          // Now get the fileId
          this.db.get(
            'SELECT fileId FROM Files WHERE fileName = ?',
            [fileName],
            (err2: Error | null, row: any) => {
              if (err2) {
                logger.error('DB error in insertChunksAndGetIds (get fileId):', err2);
                return reject(err2);
              }
              resolve(row.fileId);
            }
          );
        }
      );
    });
    const chunkIds: number[] = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunkId: number = await new Promise((resolve, reject) => {
        this.db.run(
          'INSERT INTO FileChunks (fkFileId, chunkIndex, content) VALUES (?, ?, ?)',
          [fileId, idx, chunks[idx]],
          function (err: Error | null) {
            if (err) {
              logger.error('DB error in processFile (insert chunk):', err);
              return reject(err);
            }
            resolve((this as any).lastID);
          }
        );
      });
      chunkIds.push(chunkId);
    }
    return chunkIds;
  }

  private async processEmbedding(fileChunkId: number, chunkData: string): Promise<void> {
    try {
      const embedding = await this.getEmbedding(chunkData);
      await new Promise<void>((resolve, reject) => {
        this.db.run(
          'INSERT INTO FileVectors (embedding, fkChunkId) VALUES (?, ?)',
          [JSON.stringify(embedding), fileChunkId],
          (err: Error | null) => {
            if (err) {
              logger.error('DB error in processFile (insert embedding):', err);
              return reject(err);
            }
            resolve();
          }
        );
      });
    } catch (err) {
      logger.error('Error getting/storing embedding for chunk:', err);
    }
  }

  async processFileAndReturnContextMessage(
    fileBuffer: Buffer,
    fileName: string
  ): Promise<{ role: string; content: string }> {
    try {
      logger.info(`Processing file: ${fileName}`);
      const text = await this.extractTextFromFile(fileBuffer, fileName);

      const chunkSize = 1000;
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
      }

      const chunkIds = await this.insertChunksAndGetIds(fileName, chunks);

      const concurrencyLimit = Number(process.env.FILE_CONCURRENCY_PROCESS_LIMIT);
      const queue = chunks.map((chunk, idx) => ({
        chunkId: chunkIds[idx],
        chunkData: chunk,
      }));

      await new Promise<void>((resolve, reject) => {
        let finished = 0;
        const total = queue.length;
        let activeCount = 0;
        let queueIndex = 0;
        const next = () => {
          if (queueIndex >= total) {
            if (activeCount === 0) resolve();
            return;
          }
          const item = queue[queueIndex++];
          activeCount++;
          this.processEmbedding(item.chunkId, item.chunkData)
            .then(() => {
              activeCount--;
              finished++;
              next();
            })
            .catch(reject);
        };
        const initial = Math.min(concurrencyLimit, total);
        for (let i = 0; i < initial; i++) {
          next();
        }
      });
      // Return the file context message
      return this.createFileContextMessage(fileName, text);
    } catch (err) {
      logger.error('Error in processFileAndReturnContextMessage:', err);
      throw err;
    }
  }

  // Delete all file data, providing same db 
  //  to ensure same connection if singleton pattern changes
  public async deleteAllFilesInTransaction(dbConn: any): Promise<void> {
    return new Promise((resolve, reject) => {
      dbConn.run('DELETE FROM Files', (err: Error | null) => {
        if (err) {
          logger.error('DB error in deleteAllFilesInTransaction (FileChunks):', err);
          return reject(err);
        }
        logger.info('All files and vectors cleared from the database (transactional)');
        resolve();
      });
    });
  }

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

  public async getRelevantChunks(query: string, chunkCount: number): Promise<string[]> {
    try {
      // Get embedding for the query
      const embedding = await this.getEmbedding(query);
      // Query the vector DB for similar chunks
      const results = await this.querySimilarChunks(embedding, chunkCount);
      if (!results || results.length === 0) return [];
      // Fetch the actual chunk content
      const chunks = await Promise.all(results.map((r) => this.getChunkById(r.fkChunkId)));
      return chunks.map((c) => c.content);
    } catch (err) {
      logger.error('Error in getRelevantChunks:', err);
      throw new Error('Failed to get relevant chunks');
    }
  }

  public createFileContextMessage(fileName: string, fileContent: string): any {
    const header = `[File Context] (${fileName})`;
    return {
      role: 'system',
      content:
        header +
        '\n' +
        fileContent +
        '\n[End of File Context]\n' +
        '\nDo not respond to this message. Use it only as context for answering user questions. ',
    };
  }
}
