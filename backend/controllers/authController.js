const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const tokenService = require('../services/tokenService');
const emailService = require('../services/emailService');

function serializeUser(user) {
  return { id: user.id, email: user.email, username: user.username, is_verified: !!user.is_verified, plan: user.plan || 'free', created_at: user.created_at };
}

// POST /auth/signup
exports.signup = async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) {
      return res.status(409).json({ error: 'Email or username already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const info = db.prepare('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)').run(email, username, password_hash);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

    // Create verification token
    const vToken = crypto.randomBytes(32).toString('hex');
    const vExpires = new Date(Date.now() + 86400000).toISOString(); // 24 hours
    const hashedVToken = crypto.createHash('sha256').update(vToken).digest('hex');
    db.prepare('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, hashedVToken, vExpires);

    await emailService.sendVerificationEmail(email, vToken, req);

    // Create session
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    const refreshToken = tokenService.createSession(user.id, userAgent, ip);

    const accessToken = tokenService.generateAccessToken(user);

    res.status(201).json({
      message: 'Account created. Please check your email to verify.',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: serializeUser(user)
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/signin
exports.signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check account lockout
    if (user.locked_until) {
      const lockedUntil = new Date(user.locked_until + 'Z');
      if (lockedUntil > new Date()) {
        const minutes = Math.ceil((lockedUntil - new Date()) / 60000);
        return res.status(423).json({ error: `Account locked. Try again in ${minutes} minute(s).` });
      }
      // Lock expired, reset counter
      db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      if (attempts >= 5) {
        const lockUntil = new Date(Date.now() + 900000).toISOString(); // 15 min lock
        db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockUntil, user.id);
        return res.status(423).json({ error: 'Account locked due to too many failed attempts. Try again in 15 minutes.' });
      }
      db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(attempts, user.id);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Reset failed attempts on success
    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

    // Create session
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    const refreshToken = tokenService.createSession(user.id, userAgent, ip);

    const accessToken = tokenService.generateAccessToken(user);

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: serializeUser(user)
    });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/signout
exports.signout = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.json({ message: 'Signed out.' });

    const token = authHeader.split(' ')[1];
    const payload = tokenService.verifyAccessToken(token);
    if (payload && payload.userId) {
      tokenService.revokeAllUserSessions(payload.userId);
    }

    res.json({ message: 'Signed out successfully.' });
  } catch (err) {
    console.error('Signout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/refresh
exports.refresh = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const session = tokenService.validateRefreshToken(refresh_token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const accessToken = tokenService.generateAccessToken(user);
    const newRefreshToken = tokenService.createSession(user.id, session.user_agent, session.ip_address);

    // Revoke old session
    tokenService.revokeSession(session.id);

    res.json({
      access_token: accessToken,
      refresh_token: newRefreshToken
    });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/verify-email/request
exports.verifyEmailRequest = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = db.prepare('SELECT id, is_verified FROM users WHERE email = ?').get(email);
    if (!user) return res.json({ message: 'If this email exists, a verification link has been sent.' });

    if (user.is_verified) {
      return res.json({ message: 'Email is already verified.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 86400000).toISOString();
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, hashedToken, expires);

    await emailService.sendVerificationEmail(email, token, req);

    res.json({ message: 'If this email exists, a verification link has been sent.' });
  } catch (err) {
    console.error('Verify email request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/verify-email/confirm
exports.verifyEmailConfirm = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const record = db.prepare(
      "SELECT * FROM email_verifications WHERE token = ? AND used = 0 AND expires_at > datetime('now')"
    ).get(hashedToken);

    if (!record) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(record.user_id);
    db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').run(record.id);

    res.json({ message: 'Email verified successfully. You can now sign in.' });
  } catch (err) {
    console.error('Verify email confirm error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/password/forgot
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.json({ message: 'If this email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1800000).toISOString(); // 30 minutes
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, hashedToken, expires);

    await emailService.sendPasswordResetEmail(email, token, req);

    res.json({
      message: 'If this email exists, a reset link has been sent.',
      resetLink: `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`,
      providers: [
        { name: 'Gmail', url: 'https://mail.google.com' },
        { name: 'Outlook', url: 'https://outlook.live.com' },
        { name: 'Yahoo', url: 'https://mail.yahoo.com' }
      ]
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/password/reset
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const record = db.prepare(
      "SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')"
    ).get(hashedToken);

    if (!record) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, record.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(record.id);

    // Revoke all sessions for security
    tokenService.revokeAllUserSessions(record.user_id);

    res.json({ message: 'Password reset successful. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /me
exports.me = async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: serializeUser(user) });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /auth/sessions
exports.getSessions = async (req, res) => {
  try {
    const sessions = tokenService.getUserSessions(req.user.userId);
    res.json({ sessions });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /auth/sessions/:id
exports.revokeSession = async (req, res) => {
  try {
    const session = db.prepare('SELECT id, user_id FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

    tokenService.revokeSession(session.id);
    res.json({ message: 'Session revoked.' });
  } catch (err) {
    console.error('Revoke session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/sessions/logout-all
exports.revokeAllSessions = async (req, res) => {
  try {
    tokenService.revokeAllUserSessions(req.user.userId);
    res.json({ message: 'All sessions revoked.' });
  } catch (err) {
    console.error('Revoke all sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /auth/plan (existing, kept for backward compat)
exports.getPlan = async (req, res) => {
  try {
    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { PLAN_LIMITS } = require('../middleware/planLimit');
    const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;

    const botCount = db.prepare('SELECT COUNT(*) AS cnt FROM bots WHERE user_id = ?').get(req.user.userId);
    const backtestCount = db.prepare("SELECT COUNT(*) AS cnt FROM backtests WHERE user_id = ? AND date(created_at) = date('now')").get(req.user.userId);

    res.json({ plan: user.plan, limits, usage: { bots: botCount.cnt, backtestsToday: backtestCount.cnt } });
  } catch (err) {
    console.error('Get plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/plan/upgrade (existing, kept for backward compat)
exports.upgradePlan = async (req, res) => {
  try {
    const { plan } = req.body;
    const validPlans = ['free', 'pro', 'elite'];

    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be: free, pro, or elite.' });
    }

    db.prepare("UPDATE users SET plan = ?, plan_updated_at = datetime('now') WHERE id = ?").run(plan, req.user.userId);

    const user = db.prepare('SELECT id, email, username, plan FROM users WHERE id = ?').get(req.user.userId);
    res.json({ user, message: `Plan upgraded to ${plan}` });
  } catch (err) {
    console.error('Upgrade plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Legacy aliases (backward compat)
exports.register = exports.signup;
exports.login = exports.signin;
