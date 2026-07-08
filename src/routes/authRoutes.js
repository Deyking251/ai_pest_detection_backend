import express from 'express';
import {
  registerUser,
  loginUser,
  verifyEmail,
  verifyPhone,
  resendOtp,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  updateProfile,
  getProfile,
} from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Registration & Login
router.post('/register', registerUser);
router.post('/login', loginUser);

// Email & Phone Verification
router.post('/verify-email', verifyEmail);
router.post('/verify-phone', verifyPhone);
router.post('/resend-otp', resendOtp);

// Forgot Password Flow
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);

// Profile Management
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);

export default router;
