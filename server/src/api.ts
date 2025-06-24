import express from 'express';
import multer from 'multer';
import { chatController } from './controllers/chatController';
import { asyncHandler } from './middlewares/asyncHandler';

const router = express.Router();
const upload = multer();

router.get('/chat/get', asyncHandler(chatController.get));
router.get('/chat/get-all-dtos', asyncHandler(chatController.getAllDtos));

router.post('/chat/submit', asyncHandler(chatController.chat));
router.post('/chat/upload-file', upload.single('file'), asyncHandler(chatController.uploadFile));

export default router;
