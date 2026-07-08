import express from 'express';
import { 
  analyzeCropImage, 
  getScanHistory, 
  deleteScan, 
  toggleBookmark 
} from '../controllers/scanController.js';
import { protect, optionalAuth } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// Analyze endpoint supports guest scans, but associates with a user if logged in
router.post('/analyze', optionalAuth, upload.single('image'), analyzeCropImage);

// Historical analysis endpoints require authentication
router.get('/history', protect, getScanHistory);
router.delete('/history/:id', protect, deleteScan);
router.patch('/history/:id/bookmark', protect, toggleBookmark);

export default router;
