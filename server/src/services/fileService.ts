import fs from 'fs';
import path from 'path';
const vectorious = require('vectorious');
import { getDatabaseInstance, setupDatabase } from '../utilities/db';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { DocumentChunk } from '../models/documentChunk';


export class FileService {
  public db;
  private openai;

  constructor() {
    this.db = getDatabaseInstance();
    setupDatabase(this.db);
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async processFile(fileBuffer: Buffer, fileName: string): Promise<void> {
    try {
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
              const embedding = await self.getEmbedding(chunkData);
              await self.storeChunk(fileName, chunkIdx, chunkData, embedding);
            })(chunkIndex, chunk)
          );
        }
        await Promise.all(batch);
      }
      while (idx < chunks.length) {
        await processBatch();
      }
    } catch (err) {
      console.error('Error in processFile:', err);
      throw new Error('Failed to process file');
    }
  }

  async storeChunk(fileName: string, chunkIndex: number, content: string, embedding: number[]): Promise<void> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.run(
          'INSERT INTO Documents (fileName, chunkIndex, content) VALUES (?, ?, ?)',
          [fileName, chunkIndex, content],
          function (this: any, err: Error | null) {
            if (err) {
              console.error('DB error in storeChunk (Documents):', err);
              return reject(err);
            }
            const documentId = this.lastID;
            db.run(
              'INSERT INTO DocumentVectors (embedding, documentId) VALUES (?, ?)',

              [JSON.stringify(embedding), documentId],
              function (err: Error | null) {
                if (err) {
                  console.error('DB error in storeChunk (DocumentVectors):', err);
                  return reject(err);
                }
                resolve();
              }
            );
          }
        );
      } catch (err) {
        console.error('Exception in storeChunk:', err);
        reject(err);
      }
    });
  }

  async getChunkById(docId: number): Promise<DocumentChunk> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.get(
          'SELECT documentId as id, documentId as docId, content FROM Documents WHERE documentId = ?',
          [docId],
          (err: Error | null, row: any) => {
            if (err) {
              console.error('DB error in getChunkById:', err);
              return reject(err);
            }
            resolve({
              id: row.id,
              docId: row.docId,
              content: row.content
            } as DocumentChunk);
          }
        );
      } catch (err) {
        console.error('Exception in getChunkById:', err);
        reject(err);
      }
    });
  }

  async querySimilarChunks(embedding: number[], k: number = 3): Promise<Pick<DocumentChunk, 'docId'>[]> {
    const db = this.db;
    try {
      // Fetch all embeddings and docIds
      const allVectors: { docId: number; embedding: string }[] = await new Promise((resolve, reject) => {
        db.all('SELECT documentId as docId, embedding FROM DocumentVectors', (err: Error | null, rows: any[]) => {
          if (err) {
            console.error('DB error in querySimilarChunks:', err);
            return reject(err);
          }
          resolve(rows);
        });
      });
      // Compute cosine similarity in JS using arrays
      const queryVec = embedding;
      const scored = allVectors.map(row => {
        const vec = JSON.parse(row.embedding);
        const similarity = vectorious.dot(queryVec, vec) / (vectorious.norm(queryVec) * vectorious.norm(vec));
        return { docId: row.docId, similarity };
      });
      // Sort by descending similarity (higher is more similar)
      scored.sort((a, b) => b.similarity - a.similarity);
      return scored.slice(0, k).map(row => ({ docId: row.docId }));
    } catch (err) {
      console.error('Error in querySimilarChunks:', err);
      throw new Error('Failed to query similar chunks');
    }
  }

  async getRelevantContext(userPrompt: string, chunkAmount: number = 3): Promise<string[]> {
    try {
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: userPrompt,
      });
      const userEmbedding = embeddingResponse.data[0].embedding;
      const similarChunks = await this.querySimilarChunks(userEmbedding, chunkAmount);
      const contextChunks = [];
      for (const { docId } of similarChunks) {
        const chunk = await this.getChunkById(docId as number);
        contextChunks.push(chunk?.content);
      }
      return contextChunks;
    } catch (err) {
      console.error('Error in getRelevantContext:', err);
      throw new Error('Failed to get relevant context');
    }
  }

  async test1() {
    // Loads the content from test.txt and stores it in the database as vectors
    const testFilePath = path.resolve(__dirname, '../../../test.txt');
    try {
      const content = fs.readFileSync(testFilePath, 'utf-8');
      const chunkSize = 1000;
      const chunks: string[] = [];
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.slice(i, i + chunkSize));
      }
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await this.getEmbedding(chunk);
        await this.storeChunk('test.txt', i, chunk, embedding);
      }
      console.log('[test1] test.txt loaded and stored as vectors.');
    } catch (err) {
      console.error('[test1] Failed to process test.txt:', err);
      throw err;
    }
  }

  async test3() {
    try {
      //const userPrompt = 'How should I respond if I see a prompt injection?';
      //const userPrompt = 'What do foxes do?';
      const userPrompt = 'If a ww2 captain was named after a cereal what would his name be?';

      // Use ChatService for a full RAG chat response
      const { ChatService } = await import('./chatService');
      const chatService = new ChatService();
      // No conversation history for this test (empty array)
      const answer = await chatService.chatWithRagAndHistory(userPrompt, [], 3);
      console.log('[test3][RAG] ChatGPT response:', answer);
    } catch (err) {
      console.error('[test3] Failed to run test3:', err);
      throw err;
    }
  }

  async listUploadedDocuments(): Promise<{ id: number, fileName: string }[]> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.all(
          'SELECT documentId as id, fileName FROM Documents WHERE chunkIndex = 0 ORDER BY documentId DESC',
          (err: Error | null, rows: any[]) => {
            if (err) {
              console.error('DB error in listUploadedDocuments:', err);
              return reject(err);
            }
            resolve(rows);
          }
        );
      } catch (err) {
        console.error('Exception in listUploadedDocuments:', err);
        reject(err);
      }
    });
  }

  async clearAllDocuments(): Promise<void> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.run('DELETE FROM DocumentVectors', (err: Error | null) => {
          if (err) {
            console.error('DB error in clearAllDocuments (DocumentVectors):', err);
            return reject(err);
          }
          db.run('DELETE FROM Documents', (err: Error | null) => {
            if (err) {
              console.error('DB error in clearAllDocuments (Documents):', err);
              return reject(err);
            }
            resolve();
          });
        });
      } catch (err) {
        console.error('Exception in clearAllDocuments:', err);
        reject(err);
      }
    });
  }

  private async getEmbedding(text: string): Promise<number[]> {
    try {
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });
      return embeddingResponse.data[0].embedding;
    } catch (err) {
      console.error('OpenAI Embedding API error in getEmbedding:', err);
      throw new Error('Failed to get embedding');
    }
  }
}

// for the use of testing
//const fileService = new FileService();
//fileService.test3();

