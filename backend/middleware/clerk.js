const { getAuth, clerkClient } = require('@clerk/express');
const db = require('../config/database');

async function clerkAuth(req, res, next) {
  let auth;
  try {
    auth = getAuth(req);
  } catch (e) {
    return res.status(401).json({ error: 'Authentication required (Clerk middleware not initialized)' });
  }
  if (!auth?.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const clerkUserId = auth.userId;
  let user = db.prepare('SELECT * FROM users WHERE clerk_id = ?').get(clerkUserId);

  if (!user) {
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      const email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
      const username = clerkUser.username || email.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6);

      if (email) {
        const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (existing) {
          db.prepare('UPDATE users SET clerk_id = ? WHERE id = ?').run(clerkUserId, existing.id);
          user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
        } else {
          const info = db.prepare('INSERT INTO users (email, username, clerk_id, is_verified) VALUES (?, ?, ?, 1)').run(email, username, clerkUserId);
          user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
        }
      }
    } catch (clerkErr) {
      console.error('Clerk user lookup error:', clerkErr);
    }
  }

  req.auth = { userId: clerkUserId, sessionId: auth.sessionId, localUser: user || null };
  req.user = user ? { userId: user.id, email: user.email } : { userId: null };
  next();
}

async function optionalAuth(req, res, next) {
  let auth;
  try {
    auth = getAuth(req);
  } catch (e) {
    return next();
  }
  if (auth?.userId) {
    const user = db.prepare('SELECT * FROM users WHERE clerk_id = ?').get(auth.userId);
    req.auth = { userId: auth.userId, sessionId: auth.sessionId, localUser: user || null };
    req.user = user ? { userId: user.id, email: user.email } : { userId: null };
  }
  next();
}

module.exports = { clerkClient, clerkAuth, optionalAuth };
