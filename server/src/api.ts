import express from 'express';
import multer from 'multer';
import { chatController } from './controllers/chatController';
import { asyncHandler } from './middlewares/asyncHandler';

const router = express.Router();
const upload = multer();

router.get('/chat/get', asyncHandler(chatController.get as express.RequestHandler));
router.post('/chat/submit', asyncHandler(chatController.chat as express.RequestHandler));
router.post('/chat/upload-file', upload.single('file'), asyncHandler(chatController.uploadFile as express.RequestHandler));
router.get('/documents/list', asyncHandler(chatController.listDocuments as express.RequestHandler));
router.post('/chat/clear', asyncHandler(chatController.clearConversation as express.RequestHandler));
router.post('/documents/clear', asyncHandler(chatController.clearAllDocuments as express.RequestHandler));
// Streaming chat route (do not wrap in asyncHandler)
router.post('/chat/stream', chatController.streamChat as express.RequestHandler);

export default router;
