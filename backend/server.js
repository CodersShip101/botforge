const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { clerkMiddleware } = require('@clerk/express');
const db = require('./config/database');
const botRoutes = require('./routes/bots');
const { clerkAuth } = require('./middleware/clerk');

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use(clerkMiddleware());

app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

app.use('/api/bots', clerkAuth, botRoutes);
app.use('/api/bots', clerkAuth, require('./routes/versions'));
app.use('/api/backtests', clerkAuth, require('./routes/backtests'));
app.use('/api/ai', clerkAuth, require('./routes/ai'));

app.use('/api/account', clerkAuth, require('./routes/account'));

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
