const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { clerkAuth, clerkClient } = require('../middleware/clerk');
const { PLAN_LIMITS } = require('../middleware/planLimit');

const router = express.Router();

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function randomPart(len) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

// ── Profile ──────────────────────────────────────────────────────────────

router.get('/profile', clerkAuth, async (req, res) => {
  try {
    const clerkUser = await clerkClient.users.getUser(req.auth.userId);
    const localUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!localUser) return res.status(404).json({ error: 'User not found' });

    res.json({
      email: clerkUser.emailAddresses?.[0]?.emailAddress || '',
      fullName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' '),
      firstName: clerkUser.firstName || '',
      lastName: clerkUser.lastName || '',
      avatarUrl: clerkUser.imageUrl || '',
      username: localUser.username || '',
      plan: localUser.plan || 'free',
      createdAt: localUser.created_at || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/profile', clerkAuth, (req, res) => {
  try {
    const { username } = req.body;
    if (username !== undefined) {
      if (!username || username.length < 2 || username.length > 30) {
        return res.status(400).json({ error: 'Username must be 2-30 characters' });
      }
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.userId);
      if (existing) return res.status(409).json({ error: 'Username already taken' });
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.userId);
    }
    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/change-email', clerkAuth, async (req, res) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    await clerkClient.users.updateUser(req.auth.userId, { emailAddress: [newEmail] });
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(newEmail, req.user.userId);
    res.json({ message: 'Verification email sent to ' + newEmail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Security ────────────────────────────────────────────────────────────

router.get('/security', clerkAuth, async (req, res) => {
  try {
    const clerkUser = await clerkClient.users.getUser(req.auth.userId);
    const localUser = db.prepare('SELECT last_login_at, last_login_ip, last_login_device, password_last_changed FROM users WHERE id = ?').get(req.user.userId);

    res.json({
      lastLoginAt: localUser?.last_login_at || null,
      lastLoginIp: localUser?.last_login_ip || null,
      lastLoginDevice: localUser?.last_login_device || null,
      twoFactorEnabled: clerkUser.twoFactorEnabled || false,
      passwordLastChanged: localUser?.password_last_changed || null,
      hasPassword: clerkUser.passwordEnabled || false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/change-password', clerkAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (newPassword.length > 100) {
      return res.status(400).json({ error: 'New password is too long' });
    }

    try {
      await clerkClient.users.verifyPassword({ userId: req.auth.userId, password: currentPassword });
    } catch {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }

    await clerkClient.users.updateUser(req.auth.userId, { password: newPassword });
    db.prepare("UPDATE users SET password_last_changed = datetime('now') WHERE id = ?").run(req.user.userId);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/enable', clerkAuth, async (req, res) => {
  try {
    const totp = await clerkClient.users.createTOTP(req.auth.userId);
    res.json({
      message: '2FA setup initiated',
      qrCodeUrl: totp.qrCodeUrl || '',
      secret: totp.secret || '',
      uri: totp.uri || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/disable', clerkAuth, async (req, res) => {
  try {
    await clerkClient.users.disableTOTP(req.auth.userId);
    db.prepare("UPDATE users SET last_2fa_update = datetime('now') WHERE id = ?").run(req.user.userId);
    res.json({ message: '2FA disabled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Billing & Plan ──────────────────────────────────────────────────────

router.get('/plan', clerkAuth, (req, res) => {
  try {
    const user = db.prepare('SELECT plan, plan_updated_at FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
    const botCount = db.prepare('SELECT COUNT(*) AS cnt FROM bots WHERE user_id = ?').get(req.user.userId);
    const backtestCount = db.prepare("SELECT COUNT(*) AS cnt FROM backtests WHERE user_id = ? AND date(created_at) = date('now')").get(req.user.userId);
    res.json({
      plan: user.plan,
      planUpdatedAt: user.plan_updated_at || null,
      limits,
      usage: { bots: botCount.cnt, backtestsToday: backtestCount.cnt }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/plan/upgrade', clerkAuth, (req, res) => {
  try {
    const { plan } = req.body;
    const validPlans = Object.keys(PLAN_LIMITS);
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: `Invalid plan. Must be: ${validPlans.join(', ')}.` });
    }
    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const currentLimits = PLAN_LIMITS[user.plan];
    const newLimits = PLAN_LIMITS[plan];
    if (newLimits.bots < currentLimits.bots) {
      const botCount = db.prepare('SELECT COUNT(*) AS cnt FROM bots WHERE user_id = ?').get(req.user.userId);
      if (botCount.cnt > newLimits.bots) {
        return res.status(400).json({ error: `Cannot downgrade: you have ${botCount.cnt} bots, but ${plan} plan allows only ${newLimits.bots}` });
      }
    }
    db.prepare("UPDATE users SET plan = ?, plan_updated_at = datetime('now') WHERE id = ?").run(plan, req.user.userId);
    res.json({ message: `Plan upgraded to ${plan}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Devices (Sessions) ──────────────────────────────────────────────────

router.get('/sessions', clerkAuth, async (req, res) => {
  try {
    const sessions = await clerkClient.sessions.getUserSessions(req.auth.userId);
    const currentSessionId = req.auth.sessionId;
    const mapped = sessions.map(s => ({
      id: s.id,
      device: s.latestActivity?.deviceType || 'Unknown',
      browser: s.latestActivity?.browserName || (s.latestActivity?.userAgent || 'Unknown'),
      ip: s.latestActivity?.ipAddress || 'Unknown',
      city: s.latestActivity?.city || '',
      country: s.latestActivity?.country || '',
      lastActive: s.lastActiveAt || s.updatedAt || s.createdAt,
      isCurrent: s.id === currentSessionId,
      isMobile: s.latestActivity?.isMobile || false
    }));
    res.json(mapped);
  } catch (err) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const now = new Date().toISOString();
    res.json([{
      id: 'current',
      device: req.headers['user-agent']?.split('/')[0] || 'Unknown',
      browser: req.headers['user-agent'] || 'Unknown',
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '127.0.0.1',
      lastActive: now,
      isCurrent: true
    }]);
  }
});

router.delete('/sessions/:id', clerkAuth, async (req, res) => {
  try {
    await clerkClient.sessions.revokeSession(req.params.id);
    res.json({ message: 'Session revoked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/sessions', clerkAuth, async (req, res) => {
  try {
    const sessions = await clerkClient.sessions.getUserSessions(req.auth.userId);
    const currentSessionId = req.auth.sessionId;
    for (const s of sessions) {
      if (s.id !== currentSessionId) {
        await clerkClient.sessions.revokeSession(s.id);
      }
    }
    res.json({ message: 'All other sessions revoked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API Keys ────────────────────────────────────────────────────────────

router.get('/api-keys', clerkAuth, (req, res) => {
  try {
    const keys = db.prepare('SELECT id, name, public_key, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC').all(req.user.userId);
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api-keys', clerkAuth, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.length < 1) return res.status(400).json({ error: 'Name is required' });
    const nameTrimmed = name.trim();
    if (nameTrimmed.length > 50) return res.status(400).json({ error: 'Name must be 50 characters or fewer' });
    const keyCount = db.prepare('SELECT COUNT(*) AS cnt FROM api_keys WHERE user_id = ?').get(req.user.userId);
    if (keyCount.cnt >= 10) return res.status(400).json({ error: 'Maximum of 10 API keys allowed' });

    const publicKey = 'pk_live_' + randomPart(24);
    const secretKey = 'sk_live_' + randomPart(32);

    db.prepare('INSERT INTO api_keys (user_id, name, public_key, secret_hash) VALUES (?, ?, ?, ?)').run(
      req.user.userId, nameTrimmed, publicKey, hashKey(secretKey)
    );
    res.json({ name: nameTrimmed, publicKey, secretKey });
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

// ── Notifications ───────────────────────────────────────────────────────

router.get('/notifications', clerkAuth, (req, res) => {
  try {
    const user = db.prepare('SELECT notification_settings FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const settings = user.notification_settings ? JSON.parse(user.notification_settings) : {};
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/notifications', clerkAuth, (req, res) => {
  try {
    db.prepare('UPDATE users SET notification_settings = ? WHERE id = ?').run(JSON.stringify(req.body || {}), req.user.userId);
    res.json({ message: 'Notification preferences saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Connected Accounts ──────────────────────────────────────────────────

router.get('/connected', clerkAuth, async (req, res) => {
  try {
    const clerkUser = await clerkClient.users.getUser(req.auth.userId);
    const externalAccounts = clerkUser.externalAccounts || [];
    const providers = {};
    for (const acct of externalAccounts) {
      providers[acct.provider] = {
        connected: true,
        email: acct.emailAddress || acct.providerUserId || '',
        externalAccountId: acct.id,
        username: acct.username || ''
      };
    }
    const allSupported = { google: false, facebook: false, discord: false, apple: false, microsoft: false, github: false };
    for (const [key, val] of Object.entries(providers)) {
      if (key in allSupported) allSupported[key] = val;
    }
    res.json({
      providers: allSupported,
      hasPassword: clerkUser.passwordEnabled || false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/connected/disconnect', clerkAuth, async (req, res) => {
  try {
    const { externalAccountId } = req.body;
    if (!externalAccountId) return res.status(400).json({ error: 'externalAccountId is required' });

    const clerkUser = await clerkClient.users.getUser(req.auth.userId);
    const hasPassword = clerkUser.passwordEnabled || false;
    const externalAccounts = clerkUser.externalAccounts || [];
    if (!hasPassword && externalAccounts.length <= 1) {
      return res.status(400).json({ error: 'Cannot disconnect your last login method. Set a password first.' });
    }

    await clerkClient.users.unlinkExternalAccount(req.auth.userId, externalAccountId);
    res.json({ message: 'Account disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Danger Zone ─────────────────────────────────────────────────────────

router.delete('/account', clerkAuth, async (req, res) => {
  try {
    await clerkClient.users.deleteUser(req.auth.userId);

    db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM backtests WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM versions WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM bots WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM downloads WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.userId);

    res.json({ message: 'Account permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/account/reset', clerkAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM backtests WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM versions WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM bots WHERE user_id = ?').run(req.user.userId);
    db.prepare('DELETE FROM downloads WHERE user_id = ?').run(req.user.userId);
    res.json({ message: 'Account data reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
