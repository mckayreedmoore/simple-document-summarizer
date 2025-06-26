import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { FileService } from './fileService';

export interface Conversation {
  id: number;
  messages: { role: string; content: string }[];
  created_at: string;
}

export class ChatService {
  public fileService: FileService;
  private openai: OpenAI;
  private conversations: Conversation[] = [];
  private nextId = 1;
  private db;

  constructor() {
    // You should set OPENAI_API_KEY in your environment variables
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.fileService = new FileService(/*this.getEmbedding.bind(this)*/);
    this.db = this.fileService.db;
  }

  async get(): Promise<{ id: number; sender: string; text: string; created_at: string }[]> {
    try {
      return await this.getAllMessages();
    } catch (err) {
      console.error('Error in get:', err);
      throw new Error('Failed to get messages');
    }
  }

  async getLlmResponse(userMessage: string, context: string[]): Promise<string> {
    // Integrate with OpenAI Chat API
    try {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        ...context.map((c) => ({ role: 'user', content: c } as ChatCompletionMessageParam)),
        { role: 'user', content: userMessage },
      ];
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 512,
      });
      return response.choices[0].message?.content || '';
    } catch (err) {
      console.error('OpenAI API error:', err);
      return 'Error: Unable to get response from LLM.';
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });
      return response.data[0].embedding;
    } catch (err) {
      console.error('OpenAI Embedding API error:', err);
      throw new Error('Failed to get embedding');
    }
  }

  async getRelevantChunks(query: string, k: number = 3): Promise<string[]> {
    try {
      // Get embedding for the query
      const embedding = await this.getEmbedding(query);
      // Query the vector DB for similar chunks
      const results = await this.fileService.querySimilarChunks(embedding, k);
      if (!results || results.length === 0) return [];
      // Fetch the actual chunk content
      const chunks = await Promise.all(results.map(r => this.fileService.getChunkById(r.doc_id)));
      return chunks.map(c => c.content);
    } catch (err) {
      console.error('Error in getRelevantChunks:', err);
      throw new Error('Failed to get relevant chunks');
    }
  }

  // Combines RAG context and conversation history for the LLM call
  public async chatWithRagAndHistory(userPrompt: string, conversationHistory: {role: string, content: string}[] = [], k: number = 3): Promise<string> {
    try {
      const contextChunks = await this.getRelevantChunks(userPrompt, k);
      const contextMessage = `Context:\n${contextChunks.join('\n---\n')}`;
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'system', content: contextMessage },
        ...conversationHistory.map(m => ({
          role: (['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user') as 'user' | 'assistant' | 'system',
          content: m.content
        })),
        { role: 'user', content: userPrompt },
      ];
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 512,
      });
      return response.choices[0].message?.content || '';
    } catch (err) {
      console.error('Error in chatWithRagAndHistory:', err);
      throw new Error('Failed to get chat response');
    }
  }

  // Streams RAG+history chat completions incrementally using OpenAI's streaming API
  public async streamChatWithRagAndHistory(userPrompt: string, conversationHistory: {role: string, content: string}[] = [], k: number = 3, onToken: (token: string) => void): Promise<void> {
    try {
      const contextChunks = await this.getRelevantChunks(userPrompt, k);
      const contextMessage = `Context:\n${contextChunks.join('\n---\n')}`;
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'system', content: contextMessage },
        ...conversationHistory.map(m => ({
          role: (['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user') as 'user' | 'assistant' | 'system',
          content: m.content
        })),
        { role: 'user', content: userPrompt },
      ];
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 512,
        stream: true,
      });
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) onToken(content);
      }
    } catch (err) {
      console.error('Error in streamChatWithRagAndHistory:', err);
      throw new Error('Failed to stream chat response');
    }
  }

  async saveMessage(sender: string, text: string): Promise<void> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.run(
          'INSERT INTO chat_messages (sender, text) VALUES (?, ?)',
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

  async getAllMessages(): Promise<{ id: number; sender: string; text: string; created_at: string }[]> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.all(
          'SELECT id, sender, text, created_at FROM chat_messages ORDER BY id ASC',
          (err: Error | null, rows: any[]) => {
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

  async clearAllMessages(): Promise<void> {
    const db = this.db;
    return new Promise((resolve, reject) => {
      try {
        db.run('DELETE FROM chat_messages', (err: Error | null) => {
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
