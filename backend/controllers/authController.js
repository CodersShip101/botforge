const db = require('../config/database');
const { hashPassword, comparePasswords, generateToken } = require('../utils/password');
const { generateJWT } = require('../utils/jwt');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../config/email');

exports.register = async (req, res) => {
  try {
    const { email, username, password } = req.body;

    const existing = db.prepare(
      'SELECT id FROM users WHERE email = ? OR username = ?'
    ).get(email, username);

    if (existing) {
      return res.status(400).json({ error: 'Email or username already registered' });
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = generateToken();

    const info = db.prepare(
      'INSERT INTO users (email, username, password_hash, verification_token, verification_token_expires) VALUES (?, ?, ?, ?, datetime(\'now\', \'+24 hours\'))'
    ).run(email, username, passwordHash, verificationToken);

    const user = db.prepare(
      'SELECT id, email, username, is_verified, created_at FROM users WHERE id = ?'
    ).get(info.lastInsertRowid);

    const token = generateJWT(user.id);

    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({
      message: 'Account created! Check your email to verify.',
      token,
      user: { id: user.id, email: user.email, username: user.username, isVerified: false }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

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

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    const user = db.prepare(
      'SELECT id, email FROM users WHERE verification_token = ? AND verification_token_expires > datetime(\'now\')'
    ).get(token);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    db.prepare(
      'UPDATE users SET is_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE id = ?'
    ).run(user.id);

    res.json({ message: 'Email verified successfully!' });
  } catch (err) {
    console.error('Email verification error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};

exports.resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    const user = db.prepare(
      'SELECT id, is_verified FROM users WHERE email = ?'
    ).get(email);

    if (!user) {
      return res.json({ message: 'If email exists, verification link has been sent' });
    }

    if (user.is_verified) {
      return res.json({ message: 'Email already verified' });
    }

    const verificationToken = generateToken();
    db.prepare(
      'UPDATE users SET verification_token = ?, verification_token_expires = datetime(\'now\', \'+24 hours\') WHERE id = ?'
    ).run(verificationToken, user.id);

    await sendVerificationEmail(email, verificationToken);

    res.json({ message: 'If email exists, verification link has been sent' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Failed to resend email' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).get(email);

    if (!user) {
      return res.json({ message: 'If email exists, reset link has been sent' });
    }

    const resetToken = generateToken();
    db.prepare(
      'UPDATE users SET reset_token = ?, reset_token_expires = datetime(\'now\', \'+1 hour\') WHERE id = ?'
    ).run(resetToken, user.id);

    await sendPasswordResetEmail(email, resetToken);

    res.json({ message: 'If email exists, reset link has been sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
};

exports.verifyResetToken = async (req, res) => {
  try {
    const { token } = req.body;

    const user = db.prepare(
      'SELECT id, email FROM users WHERE reset_token = ? AND reset_token_expires > datetime(\'now\')'
    ).get(token);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    res.json({ message: 'Token is valid' });
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(500).json({ error: 'Token verification failed' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = db.prepare(
      'SELECT id, email FROM users WHERE reset_token = ? AND reset_token_expires > datetime(\'now\')'
    ).get(token);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const passwordHash = await hashPassword(password);

    db.prepare(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?'
    ).run(passwordHash, user.id);

    res.json({ message: 'Password reset successfully! You can now login.' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
};

exports.logout = (req, res) => {
  res.json({ message: 'Logged out successfully' });
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const user = db.prepare(
      'SELECT password_hash FROM users WHERE id = ?'
    ).get(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await comparePasswords(oldPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await hashPassword(newPassword);
    db.prepare(
      'UPDATE users SET password_hash = ? WHERE id = ?'
    ).run(newPasswordHash, req.userId);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Password change failed' });
  }
};
