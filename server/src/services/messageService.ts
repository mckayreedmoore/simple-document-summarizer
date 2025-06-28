import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { FileService } from './fileService';
import { Message } from '../models/message';
import { logger } from '../utilities/logger';
import { getDatabaseInstance, runAsync } from '../utilities/db';

export class MessageService {
  private fileService: FileService;
  private openai: OpenAI;
  private readonly db;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.fileService = new FileService();
    this.db = getDatabaseInstance();
  }

  async get(): Promise<Message[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT messageId, sender, text, createdAt FROM Messages WHERE sender != 'file' ORDER BY messageId ASC",
        (err: Error | null, rows: Message[]) => {
          if (err) {
            logger.error('DB error in getAllMessages:', err);
            return reject(err);
          }
          resolve(rows);
        }
      );
    });
  }

  async saveMessage(sender: string, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
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
    });
  }

  public async streamChat(
    userPrompt: string,
    conversationHistory: { role: string; content: string }[] = [],
    onToken?: (token: string) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    // Use env or default for chunk count
    if (typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
      throw new Error('Invalid userPrompt: must be a non-empty string.');
    }
    if (!Array.isArray(conversationHistory)) {
      throw new Error('Invalid conversationHistory: must be an array.');
    }

    // Defensive onToken
    const safeOnToken = (token: string) => {
      try {
        if (onToken) onToken(token);
      } catch (err) {
        logger.error('Error in onToken callback:', err);
      }
    };
    let fileContextInjected = false;
    let fileContent: string | undefined = undefined;
    let historyArr = Array.isArray(conversationHistory) ? conversationHistory : [];
    let fileContextMessage: ChatCompletionMessageParam | undefined = undefined;
    if (!historyArr || historyArr.length === 0) {
      const docs = await this.fileService.listUploadedDocuments();
      if (docs && docs.length > 0) {
        const latestFile = docs[0].fileName;
        fileContent = await this.fileService.getFullDocumentText(latestFile);
        fileContextInjected = !!fileContent;
        if (fileContent) {
          fileContextMessage = this.fileService.createFileContextMessage(latestFile, fileContent);
        }
      }
    }
    const contextChunks = await this.fileService.getRelevantChunks(
      userPrompt, 
      Number(process.env.RAG_RELEVANT_CHUNK_COUNT)
    );
    const contextMessage = `Context:\n${contextChunks.join('\n---\n')}`;
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'system',
        content:
          'If you see a message with role "file", do not respond to it. Use it only as context for answering user questions.',
      },
      ...(fileContextMessage ? [fileContextMessage] : []),
      { role: 'system', content: contextMessage },
      ...historyArr.map((m) => ({
        role: (['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user') as
          | 'user'
          | 'assistant'
          | 'system',
        content: m.content,
      })),
      { role: 'user', content: userPrompt },
    ];
    if (fileContextInjected) {
      // Fallback to non-streaming single response
      try {
        const response = await this.openai.chat.completions.create({
          model: process.env.OPENAI_CHAT_MODEL as string,
          messages,
          max_tokens: 512,
        });
        safeOnToken(response.choices[0].message?.content || '');
      } catch (err) {
        logger.error('OpenAI API error (non-stream):', err);
        throw new Error('Failed to get response from OpenAI API.');
      }
      return;
    }
    // Otherwise, stream as usual
    try {
      const stream = await this.openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL as string,
        messages,
        max_tokens: 512,
        stream: true,
      });
      for await (const chunk of stream) {
        if (abortSignal?.aborted) break;
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) safeOnToken(content);
      }
    } catch (err) {
      if (abortSignal?.aborted) {
        logger.info('OpenAI stream aborted by client disconnect.');
        return;
      }
      logger.error('OpenAI API error (stream):', err);
      throw new Error('Failed to stream response from OpenAI API.');
    }
  }

  // Transactional clear for all messages and documents
  public async clearAllData(): Promise<void> {
    const db = this.db;
    return new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        logger.info('Beginning clearAllData transaction');
        runAsync(db, 'BEGIN TRANSACTION')
          .then(() => runAsync(db, 'DELETE FROM Messages'))
          .then(() => this.fileService.deleteAllDocumentsInTransaction(db))
          .then(() => runAsync(db, 'COMMIT'))
          .then(() => {
            logger.info('All messages, documents, and vectors cleared from the database');
            resolve();
          })
          .catch(async (err: unknown) => {
            logger.error('DB error in clearAllData:', err);
            try {
              await runAsync(db, 'ROLLBACK');
            } catch (rollbackErr) {
              logger.error('Error during ROLLBACK in clearAllData:', rollbackErr);
            }
            reject(err);
          });
      });
    });
  }
}
