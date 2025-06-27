// conversationController.ts
import { Request, Response, NextFunction } from 'express';
import { MessageService } from '../services/messageService';
import { FileService } from '../services/fileService';
import { logger } from '../utilities/logger';

const messageService = new MessageService();
const fileService = new FileService();

export const conversationController = {
  async getConversation(req: Request, res: Response, next: NextFunction) {
    logger.info('GET /conversation - fetching messages and documents');
    const messages = await messageService.get();
    const documents = await fileService.listUploadedDocuments();
    res.json({ messages, documents });
  },

  async uploadFile(req: Request, res: Response, next: NextFunction) {
    if (!req.file) {
      logger.warn('File upload attempted with no file attached');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    logger.info(`POST /conversation/upload-file - uploading file: ${req.file.originalname}`);
    await fileService.processFile(req.file.buffer, req.file.originalname);
    res.json({ success: true });
  },

  async clearConversation(req: Request, res: Response, next: NextFunction) {
    logger.info('POST /conversation/clear - clearing all messages and documents');
    await messageService.deleteAll();
    await fileService.clearAllDocuments();
    res.json({ success: true });
  },

  // Streams conversation response incrementally using SSE
  async streamConversation(req: Request, res: Response, next: NextFunction) {
    const { prompt, history } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Message required' });
      return;
    }
    logger.info('POST /conversation/stream - streaming chat response');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    let fullResponse = '';
    try {
      await messageService.saveMessage('user', prompt);
      await messageService.streamChat(
        prompt,
        Array.isArray(history) ? history : [],
        3,
        (token: string) => {
          fullResponse += token;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
      );
      await messageService.saveMessage('bot', fullResponse);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      logger.error('Stream conversation error:', err);
      res.write(`data: ${JSON.stringify({ error: 'Failed to stream conversation.' })}\n\n`);
      res.end();
    }
  }
};
