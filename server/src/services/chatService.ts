import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { FileService } from './fileService';

// chatService.ts
// Service for chat-related business logic

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

  async startConversation(initialMessage: string): Promise<Conversation> {
    const conversation: Conversation = {
      id: this.nextId++,
      messages: [{ role: 'user', content: initialMessage }],
      created_at: new Date().toISOString(),
    };
    this.conversations.push(conversation);
    return conversation;
  }

  async addMessage(conversationId: number, role: string, content: string): Promise<void> {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv) {
      conv.messages.push({ role, content });
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

  /**
   * Main RAG chat method for API: retrieves context and returns LLM response.
   * Maintains conversation history for context sharing between responses.
   * @param userPrompt The user's question or message
   * @param conversationHistory Array of previous messages (role/content)
   * @param k Number of context chunks to retrieve
   * @returns The LLM's response string
   */
  async ragChat(userPrompt: string, conversationHistory: {role: string, content: string}[] = [], k: number = 3): Promise<string> {
    // Get relevant context from FileService
    const contextChunks = await this.fileService.getRelevantContext(userPrompt, k);
    // Compose context as a system message
    const contextMessage = `Context:\n${contextChunks.join('\n---\n')}`;
    // Build messages array: system, context, previous history, new user prompt
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'system', content: contextMessage },
      ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
      { role: 'user', content: userPrompt }
    ];
    const chatResponse = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens: 256,
    });
    return chatResponse.choices[0].message.content || '';
  }

  // chatWithRagContext is now an alias for ragChat for API clarity
  async chatWithRagContext(userPrompt: string, conversationHistory: {role: string, content: string}[] = [], k: number = 3): Promise<string> {
    return this.ragChat(userPrompt, conversationHistory, k);
  }
}
