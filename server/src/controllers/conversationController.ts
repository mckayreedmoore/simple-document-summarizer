// conversationController.ts
import { Request, Response, NextFunction } from 'express';
import { MessageService } from '../services/messageService';
import { FileService } from '../services/fileService';
import { logger } from '../utilities/logger';
import path from 'path';

const messageService = new MessageService();
const fileService = new FileService();

const ALLOWED_FILE_TYPES = [
  'text/plain',
  'application/pdf',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
  'application/octet-stream'
];

export const conversationController = {
  async getConversation(req: Request, res: Response, next: NextFunction) {
    logger.info('GET /conversation - fetching messages and documents');
    const [messages, documents] = await Promise.all([
      messageService.get(),
      fileService.listUploadedDocuments()
    ]);
    res.json({ messages, documents });
  },

  async uploadFile(req: Request, res: Response, next: NextFunction) {
    if (!req.file) {
      logger.warn('File upload attempted with no file attached');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // File type and size validation
    if (!ALLOWED_FILE_TYPES.includes(req.file.mimetype)) {
      logger.warn(`Rejected file upload: invalid type ${req.file.mimetype}`);
      return res.status(400).json({ error: 'Invalid file type' });
    }
    if (req.file.size > Number(process.env.FILE_SIZE_MAX_MB) * 1024 * 1024) {
      logger.warn(`Rejected file upload: file too large (${req.file.size} bytes)`);
      return res
        .status(400)
        .json({ error: `File too large (max ${process.env.FILE_SIZE_MAX_MB}MB)` });
    }
    // Sanitize file name: remove path, allow only safe chars, limit length
    const originalName = path.basename(req.file.originalname);
    const safeFileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
    logger.info(`POST /conversation/upload-file - uploading file: ${safeFileName}`);
    await fileService.processFile(req.file.buffer, safeFileName);
    logger.info('File processed and saved successfully');
    await messageService.saveMessage('file', safeFileName);
    res.json({ success: true });
  },

  async clearConversation(req: Request, res: Response, next: NextFunction) {
    logger.info('POST /conversation/clear - clearing all messages and documents');
    await messageService.clearAllData();
    logger.info('All messages and documents cleared');
    res.json({ success: true });
  },

  // Streams conversation response incrementally using SSE
  async streamConversation(req: Request, res: Response, next: NextFunction) {
    logger.info('POST /conversation/stream - streaming chat response');
    try {
      const { prompt, history } = req.body;
      // Input validation
      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        logger.warn('Prompt missing or invalid');
        res.status(400).json({ error: 'Message required' });
        return;
      }
      if (history !== undefined && !Array.isArray(history)) {
        logger.warn('History is not an array');
        res.status(400).json({ error: 'History must be an array' });
        return;
      }
      // Conversation size validation (in MB)
      const maxConversationMB = Number(process.env.CONVERSATION_MAX_MB);
      let conversationSizeBytes = 0;
      if (Array.isArray(history)) {
        conversationSizeBytes = Buffer.byteLength(JSON.stringify(history), 'utf8');
      }
      logger.debug(`Conversation size: ${conversationSizeBytes} bytes (max ${maxConversationMB * 1024 * 1024} bytes)`);
      if (conversationSizeBytes > maxConversationMB * 1024 * 1024) {
        logger.warn('Conversation too large');
        res.status(400).json({ error: `Conversation too large (max ${maxConversationMB}MB)` });
        return;
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      // Handle client disconnects and abort streaming
      let aborted = false;
      const abortController = new AbortController();
      const onClose = () => {
        logger.info('Client disconnected from SSE stream');
        aborted = true;
        abortController.abort();
      };
      res.on('close', onClose);
      let fullResponse = '';
      await messageService.saveMessage('user', prompt);
      await messageService.streamChat(
        prompt,
        history,
        (token) => {
          if (aborted || res.writableEnded) return;
          fullResponse += token;
          try {
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          } catch (err) {
            logger.error('Error writing to SSE stream:', err instanceof Error ? err.message + '\n' + err.stack : err);
          }
        },
        abortController.signal // Pass abort signal to streamChat
      );
      if (!aborted && !res.writableEnded) {
        await messageService.saveMessage('assistant', fullResponse);
        logger.info('Assistant response saved');
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
      res.off('close', onClose);
    } catch (err) {
      logger.error('Stream conversation error:', err instanceof Error ? err.message + '\n' + err.stack : err);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: 'Failed to stream conversation.' })}\n\n`);
        res.end();
      }
    }
  }
};
