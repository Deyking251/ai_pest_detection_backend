import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

/**
 * Protect middleware ensures that the request is authenticated with a valid JWT token.
 */
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Extract token
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cropguard_ai_secret_key');

      // Check if user still exists in database
      const [rows] = await pool.query(
        'SELECT id, name, email, created_at FROM users WHERE id = ?',
        [decoded.id]
      );

      if (rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'User associated with this token no longer exists.'
        });
      }

      // Attach user to request object
      req.user = rows[0];
      next();
    } catch (error) {
      console.error('JWT Verification Error:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed.'
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided.'
    });
  }
};

/**
 * Optional Auth middleware checks for a token but allows the request to continue even if unauthenticated.
 */
export const optionalAuth = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cropguard_ai_secret_key');
      
      const [rows] = await pool.query(
        'SELECT id, name, email, created_at FROM users WHERE id = ?',
        [decoded.id]
      );

      if (rows.length > 0) {
        req.user = rows[0];
      }
    } catch (error) {
      console.warn('Optional JWT verification failed:', error.message);
      // Fail silently and proceed as guest
    }
  }
  next();
};
