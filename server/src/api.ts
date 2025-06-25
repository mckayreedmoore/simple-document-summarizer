import express from 'express';
import multer from 'multer';
import { chatController } from './controllers/chatController';
import { asyncHandler } from './middlewares/asyncHandler';

const router = express.Router();
const upload = multer();

router.get('/chat/get', asyncHandler(chatController.get as express.RequestHandler));
router.get('/chat/get-all-dtos', asyncHandler(chatController.getAllDtos as express.RequestHandler));

router.post('/chat/submit', asyncHandler(chatController.chat as express.RequestHandler));
router.post('/chat/upload-file', upload.single('file'), asyncHandler(chatController.uploadFile as express.RequestHandler));

export default router;
