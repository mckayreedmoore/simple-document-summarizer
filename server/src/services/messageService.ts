import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { FileService } from './fileService';
import type { File } from '../models/file';
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
        `
        SELECT messageId, role, text, createdAt
        FROM Messages
        ORDER BY messageId ASC
        `,
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

  async saveMessage(role: string, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `
        INSERT INTO Messages (role, text)
        VALUES (?, ?)
        `,
        [role, text],
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
    conversationHistory: { role: string; content: string }[],
    onToken: (token: string) => void,
    abortSignal: AbortSignal
  ): Promise<void> {
    let historyArr = Array.isArray(conversationHistory) ? conversationHistory : [];
    const contextChunks = await this.fileService.getRelevantChunks(
      userPrompt,
      Number(process.env.RAG_RELEVANT_CHUNK_COUNT)
    );
    const contextMessage = `Context:\n${contextChunks.join('\n---\n')}`;
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'system', content: contextMessage },
      ...historyArr.map((m) => ({
        role: (['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user') as
          | 'user'
          | 'assistant'
          | 'system',
        content: (m as any).content,
      })),
      { role: 'user', content: userPrompt },
    ];

    try {
      const stream = await this.openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL as string,
        messages,
        max_completion_tokens: 1024,
        stream: true,
      });
      for await (const chunk of stream) {
        if (abortSignal.aborted) break;
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          try {
            onToken(content);
          } catch (err) {
            logger.error('Error in onToken callback:', err);
          }
        }
      }
    } catch (err) {
      if (abortSignal.aborted) {
        logger.info('OpenAI stream aborted by client disconnect.');
        return;
      }
      logger.error('OpenAI API error (stream):', err);
      throw err;
    }
  }

  // Transactional clear for all messages and files
  public async clearAllData(): Promise<void> {
    const db = this.db;
    return new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        logger.info('Beginning clearAllData transaction');
        runAsync(db, 'BEGIN TRANSACTION')
          .then(() => runAsync(db, 'DELETE FROM Messages'))
          .then(() => this.fileService.deleteAllFilesInTransaction(db))
          .then(() => runAsync(db, 'COMMIT'))
          .then(() => {
            logger.info('All messages and files have been cleared from the database');
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

  async getConversationSizeInMb(): Promise<{ sizeInMb: number; messageCount: number }> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `
        SELECT sizeInMb, messageCount
        FROM MessagesSizeView
        `,
        (err: Error | null, row: any) => {
          if (err) {
            logger.error('DB error in getConversationSizeInMb:', err);
            return reject(err);
          }
          resolve({
            sizeInMb: row?.sizeInMb || 0,
            messageCount: row?.messageCount || 0,
          });
        }
      );
    });
  }
}
