import express from 'express';
import multer from 'multer';
import { conversationController } from './controllers/conversationController';

const router = express.Router();
const upload = multer();

router.get('/conversation/get', conversationController.getConversation);
router.post(
  '/conversation/upload-file',
  upload.single('file'),
  conversationController.uploadFile
);
router.post('/conversation/clear', conversationController.clearConversation);
router.post('/conversation/stream', conversationController.streamConversation);

export default router;
