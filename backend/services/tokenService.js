const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const JWT_SECRET = () => process.env.JWT_SECRET || 'fallback_secret';

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET(),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET());
  } catch {
    return null;
  }
}

function createSession(userId, userAgent = '', ipAddress = '', deviceName = '') {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 86400000).toISOString();
  const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

  db.prepare(
    'INSERT INTO sessions (user_id, refresh_token, user_agent, ip_address, device_name, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, hashedToken, userAgent, ipAddress, deviceName, expiresAt);

  return refreshToken;
}

function validateRefreshToken(refreshToken) {
  const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const session = db.prepare(
    "SELECT s.*, u.email, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.refresh_token = ? AND s.expires_at > datetime('now')"
  ).get(hashedToken);

  if (!session) return null;

  db.prepare("UPDATE sessions SET last_used_at = datetime('now') WHERE id = ?").run(session.id);
  return session;
}

function revokeSession(sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function revokeAllUserSessions(userId, exceptSessionId = null) {
  if (exceptSessionId) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, exceptSessionId);
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

function getUserSessions(userId) {
  return db.prepare(
    "SELECT id, user_agent, ip_address, device_name, last_used_at, created_at, expires_at FROM sessions WHERE user_id = ? ORDER BY last_used_at DESC"
  ).all(userId);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  createSession,
  validateRefreshToken,
  revokeSession,
  revokeAllUserSessions,
  getUserSessions
};