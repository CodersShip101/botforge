const db = require('../config/database');

// Simple offline auth: uses the bearer token itself as the user identifier.
// When Clerk is available, this is skipped in favor of Clerk JWT verification.
// When Clerk is unavailable (disconnected), the token becomes the clerk_id.
function clerkAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const clerkId = authHeader.slice(7);
  let user = db.prepare('SELECT * FROM users WHERE clerk_id = ?').get(clerkId);

  // Auto-create user if not found (first request or before sync)
  if (!user) {
    const email = req.body?.email || (clerkId + '@local');
    const username = req.body?.username || 'user_' + clerkId.slice(0, 6);
    try {
      const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (existing) {
        db.prepare('UPDATE users SET clerk_id = ? WHERE id = ?').run(clerkId, existing.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
      } else {
        const info = db.prepare('INSERT INTO users (email, username, clerk_id, is_verified) VALUES (?, ?, ?, 1)').run(email, username, clerkId);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      }
    } catch {}
  }

  req.auth = { userId: clerkId, sessionId: null, localUser: user };
  req.user = { userId: user?.id, email: user?.email };
  next();
}

module.exports = { clerkAuth };
