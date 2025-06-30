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
    try {
      logger.info('GET /conversation - fetching messages and files');
      const [messages, files] = await Promise.all([
        messageService.get(),
        fileService.listUploadedFiles(),
      ]);
      res.json({ messages, files });
    } catch (err) {
      logger.error('Error in getConversation:', err);
      next(new Error('Failed to getConversation.'));
    }
  },

  async uploadFile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        logger.warn('File upload attempted with no file attached');
        throw new Error('No file uploaded');
      }
      // File type and size validation
      if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
        logger.warn(`Rejected file upload: invalid MIME type ${req.file.mimetype}`);
        throw new Error('Invalid file type');
      }
      if (req.file.size > Number(process.env.FILE_SIZE_MAX_MB) * 1024 * 1024) {
        logger.warn(`Rejected file upload: file too large (${req.file.size} bytes)`);
        throw new Error('File too large');
      }

      try {
        // Sanitize file name: remove path, allow only safe chars, limit length
        const originalName = path.basename(req.file.originalname);
        const safeFileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
        logger.info(`POST /conversation/upload-file - uploading file: ${safeFileName}`);

        const fileContextMsg = await fileService.processFileAndReturnContextMessage(
          req.file.buffer,
          safeFileName
        );

        // Save file context message after processing
        await messageService.saveMessage(fileContextMsg.role, fileContextMsg.content);
        logger.info('File processed and saved successfully');
      } catch (err) {
        throw new Error('An error occurred in file upload. Please try again or clear conversation and try again');
      }
      res.json({ success: true });
    } catch (err) {
      logger.error('Error in uploadFile:', err);
      next(err);
    }
  },

  async clearConversation(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('POST /conversation/clear - clearing all messages and files');
      await messageService.clearAllData();
      logger.info('All messages and files cleared');
      res.json({ success: true });
    } catch (err) {
      logger.error('Error in clearConversation:', err);
      next(new Error('An error occurred in clearing the conversation. Please try again.'));
    }
  },

  // Streams conversation response incrementally using SSE
  async streamConversation(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('POST /conversation/stream - streaming chat response');
      const { prompt, history } = req.body;

      // Input validation
      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        logger.warn('Prompt missing or invalid');
        throw new Error('Message required.');
      }
      if (history !== undefined && !Array.isArray(history)) {
        logger.warn('History is not an array');
        throw new Error('Conversation history malformed. Try clearing the conversation and try again.');
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
          `Conversation too large (history: ${historySizeMb.toFixed(2)}Mb + \n          prompt: ${promptMb.toFixed(2)}Mb = ${currentConversationMb.toFixed(2)}Mb > max: ${maxConversationMb}Mb)`
        );
        res.write(
          `data: ${JSON.stringify({ error: { message: `Conversation too large (max ${maxConversationMb}Mb)`, code: 'CONVERSATION_TOO_LARGE', status: 400 } })}\n\n`
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
      logger.error('Error in streamConversation:', err);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: { message: 'Failed to stream conversation.', code: 'STREAM_ERROR', status: 500 } })}\n\n`);
        res.end();
      }
    }
  },
};
