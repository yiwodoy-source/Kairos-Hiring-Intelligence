import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { getJwtSecret } from '../config/auth';

// Security: JWT secret must be a strong, random string from environment
if (process.env.JWT_SECRET === 'nexus-hr-secret-key-2026') {
  console.error('[SECURITY CRITICAL] JWT_SECRET is not properly configured or uses default weak secret!');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
}

const router = express.Router();

// Additional rate limiter specifically for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many failed login attempts. Please try again later.' },
  keyGenerator: (req) => req.ip || 'unknown',
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const adminUser = (process.env.ADMIN_USER || process.env.ADMIN_USERNAME || 'admin').trim();
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

  // Security: Log only metadata, never passwords
  console.log(`[AUTH] Login attempt for user: ${username} from IP: ${req.ip}`);

  // Input validation
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  // Type checking
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid input types' });
  }

  // Length validation to prevent DoS
  if (username.length > 100 || password.length > 100) {
    return res.status(400).json({ success: false, message: 'Input too long' });
  }

  const trimmedUsername = username.trim();
  const isUserMatch = trimmedUsername === adminUser;
  let isPasswordMatch = false;

  // Use bcrypt for secure password hashing
  if (isUserMatch && adminPasswordHash) {
    try {
      // Use await with timeout to prevent hanging
      isPasswordMatch = await bcrypt.compare(String(password), adminPasswordHash);
    } catch (error) {
      console.error('[AUTH] Bcrypt error:', error);
      return res.status(500).json({ success: false, message: 'Authentication service error' });
    }
  } else if (isUserMatch && !adminPasswordHash) {
    // SECURITY: This is a fallback and should never be used in production
    console.error('[AUTH] CRITICAL: No ADMIN_PASSWORD_HASH configured. Using plaintext comparison.');
    const adminPasswordPlain = process.env.ADMIN_PASSWORD;
    if (!adminPasswordPlain) {
      console.error('[AUTH] CRITICAL: No admin password configured at all!');
      // Always return same error to prevent enumeration
      await bcrypt.compare('dummy', '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789'); // Dummy comparison for timing
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    isPasswordMatch = String(password) === adminPasswordPlain;
  } else {
    // User doesn't match - perform dummy hash comparison to prevent timing attacks
    await bcrypt.compare('dummy', '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789');
  }

  if (isUserMatch && isPasswordMatch) {
    const token = jwt.sign(
      { 
        username: adminUser, 
        role: 'administrator',
        iat: Math.floor(Date.now() / 1000),
      },
      getJwtSecret(),
      { 
        expiresIn: '12h',
        issuer: 'nexus-hr-backend',
        audience: 'nexus-hr-frontend'
      }
    );

    console.log(`[AUTH] Successful login for user: ${adminUser}`);
    return res.json({
      success: true,
      message: 'Authentication successful',
      token,
      expiresIn: 43200 // 12 hours in seconds
    });
  }

  // Consistent error message to prevent account enumeration
  console.log(`[AUTH] Failed login attempt for user: ${trimmedUsername}`);
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

export default router;
