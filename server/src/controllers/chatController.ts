// chatController.ts
import { Request, Response } from 'express';
import { ChatService } from '../services/chatService';

const chatService = new ChatService();

export const chatController = {
  async get(req: Request, res: Response) {
    const conversations = await chatService.get();
    res.json({ conversations });
  },

  async getAllDtos(req: Request, res: Response) {
    const conversations = await chatService.getDtos();
    res.json({ conversations });
  },

  async chat(req: Request, res: Response) {
    const { prompt, history } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Message required' });
    try {
      const response = await chatService.chatWithRagAndHistory(prompt, Array.isArray(history) ? history : []);
      res.json({ response });
    } catch (err) {
      console.error('Chat error:', err);
      res.status(500).json({ error: 'Failed to process chat request.' });
    }
  },

  async uploadFile(req: Request, res: Response) {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await chatService.fileService.processFile(req.file.buffer, req.file.originalname);
    res.json({ success: true });
  },
};
