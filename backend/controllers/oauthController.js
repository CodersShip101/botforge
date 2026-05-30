const db = require('../config/database');
const { generateJWT } = require('../utils/jwt');

async function findOrCreateOAuthUser(provider, profile) {
  const existing = db.prepare(
    'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_id = ?'
  ).get(provider, profile.id);

  if (existing) {
    db.prepare(
      `UPDATE oauth_accounts SET access_token = ?, refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_id = ?`
    ).run(profile.accessToken || '', profile.refreshToken || '', provider, profile.id);

    return { userId: existing.user_id, isNewUser: false };
  }

  // Try to find user by email
  let user = profile.email ? db.prepare('SELECT id FROM users WHERE email = ?').get(profile.email) : null;
  let userId;

  if (user) {
    userId = user.id;
  } else {
    const username = (profile.email ? profile.email.split('@')[0] : 'user') + '_' + Date.now();
    const info = db.prepare(
      'INSERT INTO users (email, username, is_verified) VALUES (?, ?, 1)'
    ).run(profile.email || `${provider}_${profile.id}@oauth.local`, username);
    userId = info.lastInsertRowid;
  }

  db.prepare(
    `INSERT INTO oauth_accounts (user_id, provider, provider_id, email, name, picture_url, access_token, refresh_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId, provider, profile.id, profile.email || '',
    profile.displayName || profile.name || '', profile.picture || '',
    profile.accessToken || '', profile.refreshToken || ''
  );

  return { userId, isNewUser: !user };
}

exports.googleCallback = async (req, res) => {
  try {
    if (!req.user) return res.redirect('/login.html?error=oauth_failed');
    const { userId } = await findOrCreateOAuthUser('google', {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.displayName,
      picture: req.user.photos?.[0]?.value,
      accessToken: req.user.accessToken,
      refreshToken: req.user.refreshToken
    });
    const token = generateJWT(userId);
    res.redirect(`/login.html?token=${token}`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect('/login.html?error=oauth_failed');
  }
};

exports.facebookCallback = async (req, res) => {
  try {
    if (!req.user) return res.redirect('/login.html?error=oauth_failed');
    const { userId } = await findOrCreateOAuthUser('facebook', {
      id: req.user.id,
      email: req.user.emails?.[0]?.value,
      displayName: req.user.displayName,
      picture: req.user.photos?.[0]?.value,
      accessToken: req.user.accessToken,
      refreshToken: req.user.refreshToken
    });
    const token = generateJWT(userId);
    res.redirect(`/login.html?token=${token}`);
  } catch (err) {
    console.error('Facebook callback error:', err);
    res.redirect('/login.html?error=oauth_failed');
  }
};

exports.linkOAuth = async (req, res) => {
  try {
    const { provider, accessToken, refreshToken, profile } = req.body;

    const existing = db.prepare(
      'SELECT id FROM oauth_accounts WHERE provider = ? AND provider_id = ?'
    ).get(provider, profile.id);

    if (existing) {
      return res.status(400).json({ error: `This ${provider} account is already linked to another account` });
    }

    db.prepare(
      `INSERT INTO oauth_accounts (user_id, provider, provider_id, email, name, picture_url, access_token, refresh_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.userId, provider, profile.id, profile.email || '',
      profile.displayName || '', profile.picture || '',
      accessToken, refreshToken || ''
    );

    res.json({ message: `${provider} account linked successfully` });
  } catch (err) {
    console.error('Link OAuth error:', err);
    res.status(500).json({ error: 'Failed to link OAuth account' });
  }
};

exports.unlinkOAuth = async (req, res) => {
  try {
    const { provider } = req.params;

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
    const oauthCount = db.prepare(
      'SELECT COUNT(*) AS cnt FROM oauth_accounts WHERE user_id = ?'
    ).get(req.userId);

    if (!user.password_hash && oauthCount.cnt <= 1) {
      return res.status(400).json({
        error: 'Cannot unlink last auth method. Set a password first.'
      });
    }

    const result = db.prepare(
      'DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?'
    ).run(req.userId, provider);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'OAuth account not found' });
    }

    res.json({ message: `${provider} account unlinked successfully` });
  } catch (err) {
    console.error('Unlink OAuth error:', err);
    res.status(500).json({ error: 'Failed to unlink OAuth account' });
  }
};
