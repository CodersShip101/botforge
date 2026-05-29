const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const db = require('./config/database');
const botRoutes = require('./routes/bots');
const { clerkAuth, clerkClient } = require('./middleware/clerk');
const { PLAN_LIMITS } = require('./middleware/planLimit');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve frontend files (parent directory)
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Clerk user sync - creates/updates local user from Clerk session
app.post('/api/auth/sync', clerkAuth, async (req, res) => {
  try {
    const { userId, email, username } = req.body;

    let user = db.prepare('SELECT * FROM users WHERE clerk_id = ?').get(userId);

    if (!user) {
      const existingEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (existingEmail) {
        db.prepare('UPDATE users SET clerk_id = ? WHERE id = ?').run(userId, existingEmail.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(existingEmail.id);
      } else {
        const uname = username || email.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6);
        const info = db.prepare('INSERT INTO users (email, username, clerk_id, is_verified) VALUES (?, ?, ?, 1)').run(email, uname, userId);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      }
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      plan: user.plan || 'free',
      is_verified: !!user.is_verified,
      created_at: user.created_at
    });
  } catch (err) {
    console.error('User sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Protected routes
app.use('/api/bots', clerkAuth, botRoutes);
app.use('/api/bots', clerkAuth, require('./routes/versions'));
app.use('/api/backtests', clerkAuth, require('./routes/backtests'));
app.use('/api/ai', clerkAuth, require('./routes/ai'));

// Plan endpoints
app.get('/api/auth/plan', clerkAuth, async (req, res) => {
  try {
    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
    const botCount = db.prepare('SELECT COUNT(*) AS cnt FROM bots WHERE user_id = ?').get(req.user.userId);
    const backtestCount = db.prepare("SELECT COUNT(*) AS cnt FROM backtests WHERE user_id = ? AND date(created_at) = date('now')").get(req.user.userId);
    res.json({ plan: user.plan, limits, usage: { bots: botCount.cnt, backtestsToday: backtestCount.cnt } });
  } catch (err) {
    console.error('Get plan error:', err);
    res.status(500).json({ error: 'Failed to fetch plan' });
  }
});

app.post('/api/auth/plan/upgrade', clerkAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const validPlans = ['free', 'pro', 'elite'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be: free, pro, or elite.' });
    }
    db.prepare("UPDATE users SET plan = ?, plan_updated_at = datetime('now') WHERE id = ?").run(plan, req.user.userId);
    res.json({ message: `Plan upgraded to ${plan}` });
  } catch (err) {
    console.error('Upgrade plan error:', err);
    res.status(500).json({ error: 'Failed to upgrade plan' });
  }
});

// Device management via Clerk
app.get('/api/sessions', clerkAuth, async (req, res) => {
  try {
    const sessions = await clerkClient.users.getUserSessionList(req.auth.userId);
    res.json(sessions);
  } catch (err) {
    console.error('Sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.delete('/api/sessions/:id', clerkAuth, async (req, res) => {
  try {
    await clerkClient.sessions.revoke(req.params.id);
    res.json({ message: 'Session revoked' });
  } catch (err) {
    console.error('Revoke session error:', err);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

app.delete('/api/sessions', clerkAuth, async (req, res) => {
  try {
    const sessions = await clerkClient.users.getUserSessionList(req.auth.userId);
    const currentSessionId = req.auth.sessionId;
    for (const session of sessions.data) {
      if (session.id !== currentSessionId) {
        await clerkClient.sessions.revoke(session.id);
      }
    }
    res.json({ message: 'All other sessions revoked' });
  } catch (err) {
    console.error('Revoke all sessions error:', err);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  (async () => {
    await db.init();
    await new Promise(resolve => {
      app.listen(PORT, () => {
        console.log(`VANTIS AI API running on port ${PORT}`);
        resolve();
      });
    });
  })();
}

module.exports = app;
