const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const tokenService = require('../services/tokenService');

const PROVIDERS = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scope: 'openid email profile',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
  },
  microsoft: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scope: 'openid email profile User.Read',
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || ''
  },
  apple: {
    authorizeUrl: 'https://appleid.apple.com/auth/authorize',
    tokenUrl: 'https://appleid.apple.com/auth/token',
    userInfoUrl: null, // Apple provides user info in the ID token
    scope: 'name email',
    clientId: process.env.APPLE_CLIENT_ID || '',
    clientSecret: process.env.APPLE_CLIENT_SECRET || '',
    redirectUri: process.env.APPLE_REDIRECT_URI || ''
  }
};

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

// GET /auth/oauth/:provider
exports.initiate = (req, res) => {
  const { provider } = req.params;
  const config = PROVIDERS[provider];

  if (!config) {
    return res.status(400).json({ error: `Unsupported provider: ${provider}. Use: google, microsoft, or apple.` });
  }

  const state = generateState();
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/oauth/${provider}/callback`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scope,
    state
  });

  if (provider === 'apple') {
    params.set('response_mode', 'form_post');
  }

  // Store state in a simple way (in production, use Redis/cache)
  // For MVP, we append the state hint
  res.json({
    url: `${config.authorizeUrl}?${params.toString()}`,
    state,
    provider,
    configured: !!config.clientId
  });
};

// GET /auth/oauth/:provider/callback
exports.callback = async (req, res) => {
  const { provider } = req.params;
  const config = PROVIDERS[provider];

  if (!config) {
    return res.status(400).json({ error: 'Invalid provider' });
  }

  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/login.html?oauth_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.status(400).json({ error: 'Authorization code required' });
  }

  if (!config.clientId) {
    return res.redirect('/login.html?oauth_error=OAuth+not+configured.+Set+provider+client+ID+in+environment.');
  }

  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/oauth/${provider}/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error(`OAuth ${provider} token exchange error:`, tokenData);
      return res.redirect('/login.html?oauth_error=Failed+to+authenticate+with+provider.');
    }

    // Get user info
    let email = '';
    let name = '';
    let providerId = '';

    if (provider === 'google') {
      const userRes = await fetch(config.userInfoUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userData = await userRes.json();
      email = userData.email;
      name = userData.name || userData.given_name || email.split('@')[0];
      providerId = userData.id;
    } else if (provider === 'microsoft') {
      const userRes = await fetch(config.userInfoUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userData = await userRes.json();
      email = userData.mail || userData.userPrincipalName || '';
      name = userData.displayName || email.split('@')[0];
      providerId = userData.id;
    } else if (provider === 'apple') {
      // Apple sends user data in the ID token
      const idToken = tokenData.id_token;
      if (idToken) {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          email = payload.email || '';
          name = payload.name || email.split('@')[0];
          providerId = payload.sub;
        }
      }
    }

    if (!email) {
      return res.redirect('/login.html?oauth_error=Could+not+retrieve+email+from+provider.');
    }

    // Look up user by provider_id or email
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (user) {
      db.prepare('UPDATE users SET is_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    } else {
      const username = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase().substring(0, 20) +
        '_' + crypto.randomBytes(3).toString('hex');
      const password_hash = await bcrypt.hash(crypto.randomBytes(20).toString('hex'), 10);
      const info = db.prepare('INSERT INTO users (email, username, password_hash, is_verified) VALUES (?, ?, ?, 1)').run(email.toLowerCase(), username, password_hash);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }

    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    const refreshToken = tokenService.createSession(user.id, userAgent, ip);
    const accessToken = tokenService.generateAccessToken(user);

    // Redirect to frontend with tokens in hash
    res.redirect(`/oauth-callback.html#access_token=${accessToken}&refresh_token=${refreshToken}`);
  } catch (err) {
    console.error(`OAuth ${provider} callback error:`, err);
    res.redirect('/login.html?oauth_error=Authentication+failed.');
  }
};

module.exports.PROVIDERS = PROVIDERS;