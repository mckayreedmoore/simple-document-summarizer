import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { FileService } from './fileService';
import { Message } from '../models/message';
import { logger } from '../utilities/logger';

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
              logger.error('DB error in getAllMessages:', err);
              return reject(err);
            }
            resolve(rows);
          }
        );
      } catch (err) {
        logger.error('Exception in getAllMessages:', err);
        reject(err);
      }
    });
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
              logger.error('DB error in saveMessage:', err);
              return reject(err);
            }
            resolve();
          }
        );
      } catch (err) {
        logger.error('Exception in saveMessage:', err);
        reject(err);
      }
    });
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
          fileContextMessage = this.fileService.createFileContextMessage(fileContent);
        }
      }
    }
    const contextChunks = await this.fileService.getRelevantChunks(userPrompt, k);
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
        model: process.env.OPENAI_CHAT_MODEL as string,
        messages,
        max_tokens: 512,
      });
      onToken(response.choices[0].message?.content || '');
      return;
    }
    // Otherwise, stream as usual
    const stream = await this.openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL as string,
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
            logger.error('DB error in clearAllMessages:', err);
            return reject(err);
          }
          resolve();
        });
      } catch (err) {
        logger.error('Exception in clearAllMessages:', err);
        reject(err);
      }
    });
  }
}
