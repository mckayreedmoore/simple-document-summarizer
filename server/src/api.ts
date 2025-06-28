import express from 'express';
import multer from 'multer';
import { conversationController } from './controllers/conversationController';
import { asyncHandler } from './middlewares/asyncHandler';

const router = express.Router();
const upload = multer();

router.get('/conversation/get', asyncHandler(conversationController.getConversation));
router.post(
  '/conversation/upload-file',
  upload.single('file'),
  asyncHandler(conversationController.uploadFile)
);
router.post('/conversation/clear', asyncHandler(conversationController.clearConversation));
router.post('/conversation/stream', conversationController.streamConversation);

export default router;
