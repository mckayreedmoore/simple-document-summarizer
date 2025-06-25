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

  constructor() {
    // You should set OPENAI_API_KEY in your environment variables
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.fileService = new FileService(/*this.getEmbedding.bind(this)*/);
  }

  async get(): Promise<Conversation[]> {
    // Return minimal info for all conversations
    return this.conversations.map(({ id, created_at }) => ({ id, created_at, messages: [] }));
  }

  async getDtos(): Promise<Conversation[]> {
    // Return all conversation DTOs
    return this.conversations;
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
    // Get embedding from OpenAI API
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
    // Get embedding for the query
    const embedding = await this.getEmbedding(query);
    // Query the vector DB for similar chunks
    const results = await this.fileService.querySimilarChunks(embedding, k);
    // Fetch the actual chunk content
    const chunks = await Promise.all(results.map(r => this.fileService.getChunkById(r.doc_id)));
    return chunks.map(c => c.content);
  }

  // Combines RAG context and conversation history for the LLM call
  public async chatWithRagAndHistory(userPrompt: string, conversationHistory: {role: string, content: string}[] = [], k: number = 3): Promise<string> {
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
  }
}
