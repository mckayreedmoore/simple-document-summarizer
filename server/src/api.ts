import express from 'express';
import multer from 'multer';
import { conversationController } from './controllers/conversationController';
import { asyncHandler } from './middlewares/asyncHandler';

const router = express.Router();
const upload = multer();

router.get(
  '/conversation/get',
  asyncHandler(conversationController.get as express.RequestHandler)
);
router.post(
  '/conversation/upload-file',
  upload.single('file'),
  asyncHandler(conversationController.uploadFile as express.RequestHandler)
);
router.post(
  '/conversation/clear',
  asyncHandler(conversationController.clearConversation as express.RequestHandler)
);

router.post(
  '/conversation/stream',
  conversationController.streamConversation as express.RequestHandler
);

export default router;
