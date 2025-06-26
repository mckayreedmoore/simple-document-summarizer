// chatController.ts
import { Request, Response } from 'express';
import { ChatService } from '../services/chatService';

const chatService = new ChatService();

export const chatController = {
  async get(req: Request, res: Response) {
    const messages = await chatService.get();
    res.json({ messages });
  },

  async chat(req: Request, res: Response) {
    const { prompt, history } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Message required' });
    try {
      // Save user message
      await chatService.saveMessage('user', prompt);
      const response = await chatService.chatWithRagAndHistory(prompt, Array.isArray(history) ? history : []);
      // Save bot response
      await chatService.saveMessage('bot', response);
      res.json({ response });
    } catch (err) {
      console.error('Chat error:', err);
      res.status(500).json({ error: 'Failed to process chat request.' });
    }
  },

  async uploadFile(req: Request, res: Response) {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await chatService.fileService.processFile(req.file.buffer, req.file.originalname);
    // No longer save file upload messages to chat
    res.json({ success: true });
  },

  async getConversation(req: Request, res: Response) {
    const messages = await chatService.getAllMessages();
    res.json({ messages });
  },

  async saveMessage(req: Request, res: Response) {
    const { sender, text } = req.body;
    if (!sender || !text) return res.status(400).json({ error: 'Missing sender or text' });
    await chatService.saveMessage(sender, text);
    res.json({ success: true });
  },

  async listDocuments(req: Request, res: Response) {
    try {
      const documents = await chatService.fileService.listUploadedDocuments();
      res.json({ documents });
    } catch (err) {
      console.error('List documents error:', err);
      res.status(500).json({ error: 'Failed to list documents.' });
    }
  },

  async clearConversation(req: Request, res: Response) {
    try {
      await chatService.clearAllMessages();
      res.json({ success: true });
    } catch (err) {
      console.error('Clear conversation error:', err);
      res.status(500).json({ error: 'Failed to clear conversation.' });
    }
  },

  async clearAllDocuments(req: Request, res: Response) {
    try {
      await chatService.fileService.clearAllDocuments();
      res.json({ success: true });
    } catch (err) {
      console.error('Clear all documents error:', err);
      res.status(500).json({ error: 'Failed to clear all documents.' });
    }
  },

  // Streams chat response incrementally using SSE
  async streamChat(req: Request, res: Response) {
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
      await chatService.streamChatWithRagAndHistory(
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
      console.error('Stream chat error:', err);
      res.write(`data: ${JSON.stringify({ error: 'Failed to stream chat.' })}\n\n`);
      res.end();
    }
  },
};
