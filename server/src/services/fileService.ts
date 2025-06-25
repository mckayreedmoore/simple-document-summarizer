import fs from 'fs';
import path from 'path';
const vectorious = require('vectorious');
import { getDatabaseInstance, setupDatabase } from '../utilities/db';
import OpenAI from 'openai';

export class FileService {
  private db;
  private openai;

  constructor() {
    this.db = getDatabaseInstance();
    setupDatabase(this.db);
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async processFile(fileBuffer: Buffer, fileName: string): Promise<void> {
    const text = fileBuffer.toString('utf-8');
    const chunkSize = 1000;
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      // Use real embedding
      const embedding = await this.getEmbedding(chunk);
      await this.storeChunk(fileName, i, chunk, embedding);
    }
  }

  async storeChunk(fileName: string, chunkIndex: number, content: string, embedding: number[]): Promise<void> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO documents (file_name, chunk_index, content) VALUES (?, ?, ?)',
        [fileName, chunkIndex, content],
        function (this: any, err: Error | null) {
          if (err) return reject(err);
          const docId = this.lastID;
          db.run(
            'INSERT INTO document_vectors (embedding, doc_id) VALUES (?, ?)',
            [JSON.stringify(embedding), docId],
            function (err: Error | null) {
              if (err) return reject(err);
              resolve();
            }
          );
        }
      );
    });
  }

  async getChunkById(docId: number): Promise<{ doc_id: number; content: string }> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT rowid as doc_id, content FROM documents WHERE rowid = ?',
        [docId],
        (err: Error | null, row: any) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });
  }

  async querySimilarChunks(embedding: number[], k: number = 3): Promise<{ doc_id: number }[]> {
    const db = this.db;
    // Fetch all embeddings and doc_ids
    const allVectors: { doc_id: number; embedding: string }[] = await new Promise((resolve, reject) => {
      db.all('SELECT doc_id, embedding FROM document_vectors', (err: Error | null, rows: any[]) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    // Compute cosine similarity in JS using arrays
    const queryVec = embedding;
    const scored = allVectors.map(row => {
      const vec = JSON.parse(row.embedding);
      const similarity = vectorious.dot(queryVec, vec) / (vectorious.norm(queryVec) * vectorious.norm(vec));
      return { doc_id: row.doc_id, similarity };
    });
    // Sort by descending similarity (higher is more similar)
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, k).map(row => ({ doc_id: row.doc_id }));
  }

  // Improved mock embedding: more unique per chunk
  private async getEmbedding(text: string): Promise<number[]> {
    // Use real OpenAI embedding
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    return embeddingResponse.data[0].embedding;
  }

  async getRelevantContext(userPrompt: string, chunkAmount: number = 3): Promise<string[]> {
    // Get embedding for user prompt
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: userPrompt,
    });
    const userEmbedding = embeddingResponse.data[0].embedding;
    const similarChunks = await this.querySimilarChunks(userEmbedding, chunkAmount);
    const contextChunks = [];
    for (const { doc_id } of similarChunks) {
      const chunk = await this.getChunkById(doc_id);
      contextChunks.push(chunk?.content);
    }
    return contextChunks;
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
    //const userPrompt = 'How should I respond if I see a prompt injection?';
    //const userPrompt = 'What do foxes do?';
    const userPrompt = 'If a ww2 captain was named after a cereal what would his name be?';

    // Use ChatService for a full RAG chat response
    const { ChatService } = await import('./chatService');
    const chatService = new ChatService();
    // No conversation history for this test (empty array)
    const answer = await chatService.chatWithRagAndHistory(userPrompt, [], 3);
    console.log('[test3][RAG] ChatGPT response:', answer);
  }

}

// for the use of testing
//const fileService = new FileService();
//fileService.test3();

