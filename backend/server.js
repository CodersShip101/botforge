const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const session = require('express-session');
const passport = require('./config/passport');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const db = require('./config/database');
const botRoutes = require('./routes/bots');
const authRoutes = require('./routes/auth');
const { authMiddleware } = require('./middleware/auth');
const { PLAN_LIMITS } = require('./middleware/planLimit');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use(session({
  secret: process.env.JWT_SECRET || 'dev_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);

app.use('/api/bots', authMiddleware, botRoutes);
app.use('/api/bots', authMiddleware, require('./routes/versions'));
app.use('/api/backtests', authMiddleware, require('./routes/backtests'));
app.use('/api/ai', authMiddleware, require('./routes/ai'));

app.get('/api/auth/plan', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
    const botCount = db.prepare('SELECT COUNT(*) AS cnt FROM bots WHERE user_id = ?').get(req.userId);
    const backtestCount = db.prepare("SELECT COUNT(*) AS cnt FROM backtests WHERE user_id = ? AND date(created_at) = date('now')").get(req.userId);
    res.json({ plan: user.plan, limits, usage: { bots: botCount.cnt, backtestsToday: backtestCount.cnt } });
  } catch (err) {
    console.error('Get plan error:', err);
    res.status(500).json({ error: 'Failed to fetch plan' });
  }
});

app.post('/api/auth/plan/upgrade', authMiddleware, (req, res) => {
  try {
    const { plan } = req.body;
    const validPlans = ['free', 'pro', 'elite'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be: free, pro, or elite.' });
    }
    db.prepare("UPDATE users SET plan = ?, plan_updated_at = datetime('now') WHERE id = ?").run(plan, req.userId);
    res.json({ message: `Plan upgraded to ${plan}` });
  } catch (err) {
    console.error('Upgrade plan error:', err);
    res.status(500).json({ error: 'Failed to upgrade plan' });
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
