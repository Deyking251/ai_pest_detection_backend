import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { createOtp, verifyOtp } from '../services/otpService.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService.js';

// Helper to generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'cropguard_ai_secret_key', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * @desc    Register a new user (Step 1 — sends OTP to email)
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res) => {
  const { name, password, phone } = req.body;
  let { email } = req.body;

  // Basic validation
  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide name, email, and password.'
    });
  }

  // Normalize email
  email = email.trim().toLowerCase();

  try {
    // Check if user exists
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists.'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save user to database with email_verified = false
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, phone, email_verified) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, phone || null, false]
    );

    const userId = result.insertId;

    // Generate OTP and send verification email
    const emailOtp = createOtp('email_verify', email);
    try {
      await sendVerificationEmail(email, emailOtp, name);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr.message);
    }

    // If phone number provided, generate phone OTP as well
    let phoneOtpSent = false;
    if (phone) {
      createOtp('phone_verify', phone);
      phoneOtpSent = true;
      // SMS sending would go here — placeholder for Twilio/SNS integration
      console.log(`[SMS Stub] Phone OTP for ${phone} generated (integrate Twilio to send)`);
    }

    // Log registration activity
    try {
      const ip = req.ip || req.connection.remoteAddress;
      const ua = req.headers['user-agent'];
      await pool.query(
        'INSERT INTO login_activity (user_id, action_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [userId, 'REGISTER', ip, ua]
      );
    } catch (logError) {
      console.error('Registration activity log failed:', logError.message);
    }

    res.status(201).json({
      success: true,
      message: 'User registered. Verification code sent to your email.',
      requiresVerification: true,
      user: {
        id: userId,
        name,
        email,
        phone: phone || null,
      },
      token: generateToken(userId),
      phoneOtpSent,
    });
  } catch (error) {
    console.error('Registration Error:', error);
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists.'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error during registration.',
      error: error.message
    });
  }
};

/**
 * @desc    Verify email OTP after registration
 * @route   POST /api/auth/verify-email
 * @access  Public
 */
export const verifyEmail = async (req, res) => {
  let { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and verification code.',
    });
  }

  email = email.trim().toLowerCase();
  code = code.trim();

  const result = verifyOtp('email_verify', email, code);

  if (!result.valid) {
    return res.status(400).json({ success: false, message: result.message });
  }

  // Mark user email as verified in DB
  try {
    await pool.query('UPDATE users SET email_verified = ? WHERE email = ?', [true, email]);
  } catch (err) {
    console.error('DB update for email verify failed:', err.message);
  }

  res.status(200).json({
    success: true,
    message: 'Email verified successfully.',
  });
};

/**
 * @desc    Verify phone OTP after registration
 * @route   POST /api/auth/verify-phone
 * @access  Public
 */
export const verifyPhone = async (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({
      success: false,
      message: 'Please provide phone number and verification code.',
    });
  }

  const result = verifyOtp('phone_verify', phone.trim(), code.trim());

  if (!result.valid) {
    return res.status(400).json({ success: false, message: result.message });
  }

  // Mark user phone as verified in DB
  try {
    await pool.query('UPDATE users SET phone_verified = ? WHERE phone = ?', [true, phone.trim()]);
  } catch (err) {
    console.error('DB update for phone verify failed:', err.message);
  }

  res.status(200).json({
    success: true,
    message: 'Phone number verified successfully.',
  });
};

/**
 * @desc    Resend verification OTP
 * @route   POST /api/auth/resend-otp
 * @access  Public
 */
export const resendOtp = async (req, res) => {
  let { email, phone, type } = req.body;

  // type can be 'email' or 'phone'
  if (type === 'email' || (!type && email)) {
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide email.' });
    }
    email = email.trim().toLowerCase();

    // Fetch user name for personalized email
    let userName = '';
    try {
      const [users] = await pool.query('SELECT name FROM users WHERE email = ?', [email]);
      if (users.length > 0) userName = users[0].name;
    } catch (_) {}

    const otp = createOtp('email_verify', email);
    try {
      await sendVerificationEmail(email, otp, userName);
    } catch (emailErr) {
      console.error('Failed to resend verification email:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'New verification code sent to your email.',
    });
  }

  if (type === 'phone' && phone) {
    createOtp('phone_verify', phone.trim());
    console.log(`[SMS Stub] Resend phone OTP for ${phone.trim()}`);
    return res.status(200).json({
      success: true,
      message: 'New verification code sent to your phone.',
    });
  }

  res.status(400).json({ success: false, message: 'Please provide email or phone for resend.' });
};

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res) => {
  const { password } = req.body;
  let { email } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password.'
    });
  }

  // Normalize email
  email = email.trim().toLowerCase();

  try {
    // Check if user exists
    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const user = users[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Log login activity
    try {
      const ip = req.ip || req.connection.remoteAddress;
      const ua = req.headers['user-agent'];
      await pool.query(
        'INSERT INTO login_activity (user_id, action_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [user.id, 'LOGIN', ip, ua]
      );
    } catch (logError) {
      console.error('Login activity log failed:', logError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        emailVerified: !!user.email_verified,
        bio: user.bio || '',
        location: user.location || '',
        primaryCrop: user.primary_crop || '',
        experience: user.experience || '',
        farmSize: user.farm_size || '',
        profilePicture: user.profile_picture || '',
        createdAt: user.created_at
      },
      token: generateToken(user.id)
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login.',
      error: error.message
    });
  }
};

/**
 * @desc    Request password reset (sends OTP to email)
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res) => {
  let { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Please provide your email address.',
    });
  }

  email = email.trim().toLowerCase();

  try {
    const [users] = await pool.query('SELECT id, name FROM users WHERE email = ?', [email]);

    if (users.length === 0) {
      // Don't reveal whether account exists
      return res.status(200).json({
        success: true,
        message: 'If an account with this email exists, a reset code has been sent.',
      });
    }

    const user = users[0];
    const otp = createOtp('password_reset', email);

    try {
      await sendPasswordResetEmail(email, otp, user.name);
    } catch (emailErr) {
      console.error('Failed to send password reset email:', emailErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'If an account with this email exists, a reset code has been sent.',
    });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
    });
  }
};

/**
 * @desc    Verify password reset OTP
 * @route   POST /api/auth/verify-reset-code
 * @access  Public
 */
export const verifyResetCode = async (req, res) => {
  let { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and reset code.',
    });
  }

  email = email.trim().toLowerCase();
  code = code.trim();

  const result = verifyOtp('password_reset', email, code);

  if (!result.valid) {
    return res.status(400).json({ success: false, message: result.message });
  }

  // Generate a temporary reset token valid for 15 minutes
  const resetToken = jwt.sign(
    { email, purpose: 'password_reset' },
    process.env.JWT_SECRET || 'cropguard_ai_secret_key',
    { expiresIn: '15m' }
  );

  res.status(200).json({
    success: true,
    message: 'Code verified. You may now reset your password.',
    resetToken,
  });
};

/**
 * @desc    Reset password using the temporary reset token
 * @route   POST /api/auth/reset-password
 * @access  Public (requires valid resetToken)
 */
export const resetPassword = async (req, res) => {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Please provide reset token and new password.',
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters.',
    });
  }

  try {
    const decoded = jwt.verify(
      resetToken,
      process.env.JWT_SECRET || 'cropguard_ai_secret_key'
    );

    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset token.',
      });
    }

    const email = decoded.email;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({
        success: false,
        message: 'Reset token has expired. Please request a new reset code.',
      });
    }
    console.error('Reset Password Error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token.',
    });
  }
};

/**
 * @desc    Update user profile data
 * @route   PUT /api/auth/profile
 * @access  Private
 */
export const updateProfile = async (req, res) => {
  const { name, bio, location, primaryCrop, experience, farmSize, profilePicture } = req.body;
  const userId = req.user.id;

  try {
    // Check if name is provided (cannot be empty)
    if (name !== undefined && name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Name cannot be empty.',
      });
    }

    // Prepare update parameters
    const fieldsToUpdate = [];
    const values = [];

    if (name !== undefined) {
      fieldsToUpdate.push('name = ?');
      values.push(name);
    }
    if (bio !== undefined) {
      fieldsToUpdate.push('bio = ?');
      values.push(bio);
    }
    if (location !== undefined) {
      fieldsToUpdate.push('location = ?');
      values.push(location);
    }
    if (primaryCrop !== undefined) {
      fieldsToUpdate.push('primary_crop = ?');
      values.push(primaryCrop);
    }
    if (experience !== undefined) {
      fieldsToUpdate.push('experience = ?');
      values.push(experience);
    }
    if (farmSize !== undefined) {
      fieldsToUpdate.push('farm_size = ?');
      values.push(farmSize);
    }
    if (profilePicture !== undefined) {
      fieldsToUpdate.push('profile_picture = ?');
      values.push(profilePicture);
    }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update.',
      });
    }

    // Add userId to query values
    values.push(userId);

    await pool.query(
      `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE id = ?`,
      values
    );

    // Fetch the updated user
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, email_verified, bio, location, primary_crop, experience, farm_size, profile_picture FROM users WHERE id = ?',
      [userId]
    );

    const updatedUser = rows[0];

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        emailVerified: !!updatedUser.email_verified,
        bio: updatedUser.bio || '',
        location: updatedUser.location || '',
        primaryCrop: updatedUser.primary_crop || '',
        experience: updatedUser.experience || '',
        farmSize: updatedUser.farm_size || '',
        profilePicture: updatedUser.profile_picture || '',
      }
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during profile update.',
      error: error.message
    });
  }
};

/**
 * @desc    Get current user profile data
 * @route   GET /api/auth/profile
 * @access  Private
 */
export const getProfile = async (req, res) => {
  const userId = req.user.id;

  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, email_verified, bio, location, primary_crop, experience, farm_size, profile_picture FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.',
      });
    }

    const user = rows[0];

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        emailVerified: !!user.email_verified,
        bio: user.bio || '',
        location: user.location || '',
        primaryCrop: user.primary_crop || '',
        experience: user.experience || '',
        farmSize: user.farm_size || '',
        profilePicture: user.profile_picture || '',
      }
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving profile.',
      error: error.message
    });
  }
};
