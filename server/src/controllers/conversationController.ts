// conversationController.ts
import { Request, Response, NextFunction } from 'express';
import { MessageService } from '../services/messageService';
import { FileService } from '../services/fileService';
import { logger } from '../utilities/logger';
import path from 'path';

const messageService = new MessageService();
const fileService = new FileService();

const ALLOWED_MIME_TYPES = [
  'text/plain',
  'application/pdf',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
];

export const conversationController = {
  async getConversation(req: Request, res: Response, next: NextFunction) {
    logger.info('GET /conversation - fetching messages and documents');
    const [messages, documents] = await Promise.all([
      messageService.get(),
      fileService.listUploadedDocuments(),
    ]);
    res.json({ messages, documents });
  },

  async uploadFile(req: Request, res: Response, next: NextFunction) {
    if (!req.file) {
      logger.warn('File upload attempted with no file attached');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // File type and size validation
    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      logger.warn(`Rejected file upload: invalid MIME type ${req.file.mimetype}`);
      return res.status(400).json({ error: 'Invalid file type' });
    }
    if (req.file.size > Number(process.env.FILE_SIZE_MAX_MB) * 1024 * 1024) {
      logger.warn(`Rejected file upload: file too large (${req.file.size} bytes)`);
      return res
        .status(400)
        .json({ error: `File too large (max ${process.env.FILE_SIZE_MAX_MB}Mb)` });
    }

    // Sanitize file name: remove path, allow only safe chars, limit length
    const originalName = path.basename(req.file.originalname);
    const safeFileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
    logger.info(`POST /conversation/upload-file - uploading file: ${safeFileName}`);
    await fileService.processFile(req.file.buffer, safeFileName);
    logger.info('File processed and saved successfully');
    await messageService.saveMessage(
      'file',
      `fileName: ${safeFileName} \nfileContents:${req.file.buffer}`
    );
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
    try {
      logger.info('POST /conversation/stream - streaming chat response');
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

      // Set SSE headers first
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Size validation
      const maxConversationMb = Number(process.env.CONVERSATION_MAX_MB);
      const { sizeInMb: historySizeMb } = await messageService.getConversationSizeInMb();
      const promptMb = Buffer.byteLength(prompt, 'utf8') / (1024 * 1024);
      const currentConversationMb = promptMb + historySizeMb;

      if (currentConversationMb > maxConversationMb) {
        logger.warn(
          `Conversation too large (history: ${historySizeMb.toFixed(2)}Mb + 
          prompt: ${promptMb.toFixed(2)}Mb = ${currentConversationMb.toFixed(2)}Mb > max: ${maxConversationMb}Mb)`
        );
        res.write(
          `data: ${JSON.stringify({ error: `Conversation too large (max ${maxConversationMb}Mb)` })}\n\n`
        );
        res.end();
        return;
      }

      // Handle client disconnects and abort streaming
      let aborted = false;
      const abortController = new AbortController();
      const onClose = () => {
        logger.debug('Client disconnected from SSE stream - aborting response generation');
        aborted = true;
        abortController.abort();
        res.off('close', onClose);
      };
      res.on('close', onClose);
      let fullResponse = '';
      try {
        // Save user message concurrently, don't block streaming
        const saveUserPromise = messageService.saveMessage('user', prompt);
        await messageService.streamChat(
          prompt,
          history,
          (token) => {
            if (aborted || res.writableEnded) return;
            fullResponse += token;
            try {
              res.write(`data: ${JSON.stringify({ token })}\n\n`);
            } catch (err) {
              logger.error('Error writing to SSE stream:', err);
              // End the response and return if write fails
              if (!res.writableEnded) {
                res.end();
              }
              aborted = true;
              return;
            }
          },
          abortController.signal
        );
        // Wait for user message save to complete before saving assistant message
        await saveUserPromise;
        if (!aborted && !res.writableEnded) {
          await messageService.saveMessage('assistant', fullResponse);
          logger.info('Assistant response saved');
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
        }
      } finally {
        res.off('close', onClose);
      }
    } catch (err) {
      logger.error('Stream conversation error:', err);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: 'Failed to stream conversation.' })}\n\n`);
        res.end();
      }
    }
  },
};
