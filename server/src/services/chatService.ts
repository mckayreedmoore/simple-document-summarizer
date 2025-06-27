import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { FileService } from './fileService';
import { Message } from '../models/message';
import { EmbeddingModel } from 'openai/resources/embeddings';

export class ChatService {
  public fileService: FileService;
  private openai: OpenAI;
  private db;

  constructor() {
    // You should set OPENAI_API_KEY in your environment variables
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.fileService = new FileService(/*this.getEmbedding.bind(this)*/);
    this.db = this.fileService.db;
  }

  async get(): Promise<Message[]> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.all(
          'SELECT messageId, sender, text, createdAt as createdAt FROM Messages ORDER BY messageId ASC',
          (err: Error | null, rows: Message[]) => {
            if (err) {
              console.error('DB error in getAllMessages:', err);
              return reject(err);
            }
            resolve(rows);
          }
        );
      } catch (err) {
        console.error('Exception in getAllMessages:', err);
        reject(err);
      }
    });
  }

  private async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL as (string & {}) | EmbeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    } catch (err) {
      console.error('OpenAI Embedding API error:', err);
      throw new Error('Failed to get embedding');
    }
  }

  private async getRelevantChunks(query: string, k: number = 3): Promise<string[]> {
    try {
      // Get embedding for the query
      const embedding = await this.getEmbedding(query);
      // Query the vector DB for similar chunks
      const results = await this.fileService.querySimilarChunks(embedding, k);
      if (!results || results.length === 0) return [];
      // Fetch the actual chunk content
      const chunks = await Promise.all(
        results.map((r) => this.fileService.getChunkById(r.fkChunkId))
      );
      return chunks.map((c) => c.content);
    } catch (err) {
      console.error('Error in getRelevantChunks:', err);
      throw new Error('Failed to get relevant chunks');
    }
  }

  async saveMessage(sender: string, text: string): Promise<void> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.run(
          'INSERT INTO Messages (sender, text) VALUES (?, ?)',
          [sender, text],
          function (err: Error | null) {
            if (err) {
              console.error('DB error in saveMessage:', err);
              return reject(err);
            }
            resolve();
          }
        );
      } catch (err) {
        console.error('Exception in saveMessage:', err);
        reject(err);
      }
    });
  }

  private createFileContextMessage(fileContent: string): ChatCompletionMessageParam {
    return {
      role: 'file' as any, // OpenAI API only allows 'system', 'user', 'assistant', but we use this internally
      content:
        '[File Context]\n' +
        fileContent +
        '\n[End of File Context]\n' +
        '\nDo not respond to this message. Use it only as context for answering user questions.'
    };
  }

  public async streamChat(
    userPrompt: string,
    conversationHistory: { role: string; content: string }[] = [],
    k: number = 3,
    onToken: (token: string) => void
  ): Promise<void> {
    let fileContextInjected = false;
    let fileContent: string | undefined = undefined;
    let historyArr = Array.isArray(conversationHistory) ? conversationHistory : [];
    let fileContextMessage: ChatCompletionMessageParam | undefined = undefined;
    if ((!historyArr || historyArr.length === 0)) {
      const docs = await this.fileService.listUploadedDocuments();
      if (docs && docs.length > 0) {
        const latestFile = docs[0].fileName;
        fileContent = await this.fileService.getFullDocumentText(latestFile);
        fileContextInjected = !!fileContent;
        if (fileContent) {
          fileContextMessage = this.createFileContextMessage(fileContent);
        }
      }
    }
    const contextChunks = await this.getRelevantChunks(userPrompt, k);
    const contextMessage = `Context:\n${contextChunks.join('\n---\n')}`;
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'system', content: 'If you see a message with role "file", do not respond to it. Use it only as context for answering user questions.' },
      ...(fileContextMessage ? [fileContextMessage] : []),
      { role: 'system', content: contextMessage },
      ...historyArr.map((m) => ({
        role: (['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user') as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      { role: 'user', content: userPrompt },
    ];
    if (fileContextInjected) {
      // Fallback to non-streaming single response
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-3.5-turbo',
        messages,
        max_tokens: 512,
      });
      onToken(response.choices[0].message?.content || '');
      return;
    }
    // Otherwise, stream as usual
    const stream = await this.openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-3.5-turbo',
      messages,
      max_tokens: 512,
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) onToken(content);
    }
  }

  async deleteAll(): Promise<void> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.run('DELETE FROM Messages', (err: Error | null) => {
          if (err) {
            console.error('DB error in clearAllMessages:', err);
            return reject(err);
          }
          resolve();
        });
      } catch (err) {
        console.error('Exception in clearAllMessages:', err);
        reject(err);
      }
    });
  }
}
