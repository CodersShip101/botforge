const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { clerkAuth } = require('../middleware/clerk');

const router = express.Router();

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateApiKey() {
  return 'vantis_' + crypto.randomBytes(32).toString('hex');
}

router.get('/sessions/last', clerkAuth, (req, res) => {
  try {
    const user = db.prepare('SELECT last_login_at, last_login_ip FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ lastLogin: user.last_login_at || null, lastIp: user.last_login_ip || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions', clerkAuth, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const now = new Date().toISOString();
    const sessions = [{
      id: 'current',
      device: req.headers['user-agent']?.split('/')[0] || 'Unknown',
      browser: req.headers['user-agent'] || 'Unknown',
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '127.0.0.1',
      lastActive: now,
      location: 'Unknown',
      isCurrent: true
    }];
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sessions/:id/revoke', clerkAuth, (req, res) => {
  res.json({ message: 'Session revoked' });
});

router.post('/sessions/revoke-all', clerkAuth, (req, res) => {
  res.json({ message: 'All sessions revoked' });
});

router.get('/api-keys', clerkAuth, (req, res) => {
  try {
    const keys = db.prepare('SELECT id, name, key_preview, last_used, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC').all(req.user.userId);
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api-keys/:id', clerkAuth, (req, res) => {
  try {
    const key = db.prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
    if (!key) return res.status(404).json({ error: 'API key not found' });
    res.json({ id: key.id, name: key.name, key: key.key_preview === 'stored' ? 'Full key not available' : key.key_preview });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api-keys', clerkAuth, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const rawKey = generateApiKey();
    const kp = rawKey.slice(0, 12) + '...';
    db.prepare('INSERT INTO api_keys (user_id, name, key_hash, key_preview) VALUES (?, ?, ?, ?)').run(req.user.userId, name, hashKey(rawKey), kp);
    res.json({ name, key: rawKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api-keys/:id', clerkAuth, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId);
    if (!result.changes) return res.status(404).json({ error: 'API key not found' });
    res.json({ message: 'API key revoked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications', clerkAuth, (req, res) => {
  try {
    const user = db.prepare('SELECT notification_prefs FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const prefs = user.notification_prefs ? JSON.parse(user.notification_prefs) : {};
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/notifications', clerkAuth, (req, res) => {
  try {
    const prefs = JSON.stringify(req.body || {});
    db.prepare('UPDATE users SET notification_prefs = ? WHERE id = ?').run(prefs, req.user.userId);
    res.json({ message: 'Notification preferences saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/account', clerkAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM downloads WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM backtests WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM bots WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.userId);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/account/reset', clerkAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM downloads WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM backtests WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM bots WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(req.user.userId);
    res.json({ message: 'Account reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
