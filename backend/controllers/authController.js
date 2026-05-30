const db = require('../config/database');
const { hashPassword, comparePasswords, generateToken } = require('../utils/password');
const { generateJWT } = require('../utils/jwt');

exports.register = async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db.prepare(
      'SELECT id FROM users WHERE email = ? OR username = ?'
    ).get(email, username);

    if (existing) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = generateToken();

    const info = db.prepare(
      'INSERT INTO users (email, username, password_hash, verification_token) VALUES (?, ?, ?, ?)'
    ).run(email, username, passwordHash, verificationToken);

    const user = db.prepare(
      'SELECT id, email, username, is_verified, created_at FROM users WHERE id = ?'
    ).get(info.lastInsertRowid);

    const token = generateJWT(user.id);

    console.log(`Verification token for ${email}: ${verificationToken}`);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: user.id, email: user.email, username: user.username, isVerified: !!user.is_verified }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.prepare(
      'SELECT id, email, username, password_hash, is_verified FROM users WHERE email = ?'
    ).get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await comparePasswords(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateJWT(user.id);

    res.json({
      message: 'Logged in successfully',
      token,
      user: { id: user.id, email: user.email, username: user.username, isVerified: !!user.is_verified }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, email, username, is_verified, created_at FROM users WHERE id = ?'
    ).get(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oauthAccounts = db.prepare(
      'SELECT provider, email, name, picture_url FROM oauth_accounts WHERE user_id = ?'
    ).all(req.userId);

    res.json({ user: { ...user, oauthAccounts } });
  } catch (err) {
    console.error('Get current user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

exports.logout = (req, res) => {
  res.json({ message: 'Logged out successfully' });
};
