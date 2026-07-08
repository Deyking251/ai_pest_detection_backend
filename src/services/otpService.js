/**
 * OTP Service — generates, stores, and verifies 6-digit OTP codes.
 * Uses an in-memory store with automatic expiry (10 minutes).
 * For production, swap this to a Redis-backed store.
 */

// Map key: `${type}:${identifier}` → { code, expiresAt, attempts }
const otpStore = new Map();

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

/**
 * Generate a cryptographically random 6-digit OTP
 */
const generateCode = () => {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
};

/**
 * Create and store an OTP for the given type and identifier.
 * @param {'email_verify' | 'phone_verify' | 'password_reset'} type
 * @param {string} identifier - email or phone number
 * @returns {string} the generated OTP code
 */
export const createOtp = (type, identifier) => {
  const key = `${type}:${identifier.toLowerCase()}`;
  const code = generateCode();

  otpStore.set(key, {
    code,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
  });

  // Auto-cleanup after expiry
  setTimeout(() => {
    otpStore.delete(key);
  }, OTP_EXPIRY_MS + 1000);

  return code;
};

/**
 * Verify an OTP code.
 * @param {'email_verify' | 'phone_verify' | 'password_reset'} type
 * @param {string} identifier
 * @param {string} code
 * @returns {{ valid: boolean, message: string }}
 */
export const verifyOtp = (type, identifier, code) => {
  const key = `${type}:${identifier.toLowerCase()}`;
  const entry = otpStore.get(key);

  if (!entry) {
    return { valid: false, message: 'No verification code found. Please request a new one.' };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { valid: false, message: 'Verification code has expired. Please request a new one.' };
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { valid: false, message: 'Too many failed attempts. Please request a new code.' };
  }

  if (entry.code !== code) {
    return { valid: false, message: `Invalid code. ${MAX_ATTEMPTS - entry.attempts} attempts remaining.` };
  }

  // Code is valid — consume it
  otpStore.delete(key);
  return { valid: true, message: 'Verified successfully.' };
};

/**
 * Invalidate (consume) an OTP entry
 */
export const invalidateOtp = (type, identifier) => {
  const key = `${type}:${identifier.toLowerCase()}`;
  otpStore.delete(key);
};
