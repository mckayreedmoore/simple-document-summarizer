// conversationController.ts
import { Request, Response } from 'express';
import { ChatService } from '../services/chatService';
import { FileService } from '../services/fileService';


const chatService = new ChatService();
const fileService = new FileService();

export const conversationController = {
   async get(req: Request, res: Response) {
    const messages = await chatService.get();
    const documents = await fileService.listUploadedDocuments();
    res.json({ messages, documents });
  },

  async uploadFile(req: Request, res: Response) {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await chatService.fileService.processFile(req.file.buffer, req.file.originalname);
    // No longer save file upload messages to conversation
    res.json({ success: true });
  },

  async clearConversation(req: Request, res: Response) {
    try {
      await chatService.deleteAll();
      await fileService.clearAllDocuments();
      res.json({ success: true });
    } catch (err) {
      console.error('Clear conversation error:', err);
      res.status(500).json({ error: 'Failed to clear conversation.' });
    }
  },


  // Streams conversation response incrementally using SSE
  async streamConversation(req: Request, res: Response) {
    const { prompt, history } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Message required' });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    let fullResponse = '';
    try {
      await chatService.saveMessage('user', prompt);
      await chatService.streamChat(
        prompt,
        Array.isArray(history) ? history : [],
        3,
        (token: string) => {
          fullResponse += token;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
      );
      await chatService.saveMessage('bot', fullResponse);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      console.error('Stream conversation error:', err);
      res.write(`data: ${JSON.stringify({ error: 'Failed to stream conversation.' })}\n\n`);
      res.end();
    }
  },
};
