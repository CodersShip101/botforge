const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

exports.register = async (req, res) => {
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
    const user = db.prepare('SELECT id, email, username, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username, created_at: user.created_at }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.me = async (req, res) => {
  try {
    const user = db.prepare('SELECT id, email, username, created_at, plan FROM users WHERE id = ?').get(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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
