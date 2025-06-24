// chatController.ts
import { Request, Response } from 'express';
import { ChatService } from '../services/chatService';
import { FileService } from '../services/fileService';

const chatService = new ChatService();
const fileService = new FileService();

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
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const response = await chatService.getLlmResponse(message, context || []);
    res.json({ response });
  },

  async uploadFile(req: Request, res: Response) {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await fileService.processFile(req.file.buffer, req.file.originalname);
    res.json({ success: true });
  },
};
