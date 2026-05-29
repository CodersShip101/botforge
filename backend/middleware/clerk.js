const { createClerkClient, verifyToken } = require('@clerk/backend');
const db = require('../config/database');

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || '',
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY || ''
});

async function clerkAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const verified = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY || '',
      jwtKey: process.env.CLERK_JWT_KEY || ''
    });
    const clerkUserId = verified.sub;

    // Look up local user by clerk_id
    let user = db.prepare('SELECT * FROM users WHERE clerk_id = ?').get(clerkUserId);

    if (!user) {
      // Try to create a local user from Clerk data
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

    req.auth = {
      userId: clerkUserId,
      sessionId: verified.sid,
      localUser: user || null
    };
    req.user = user ? { userId: user.id, email: user.email } : { userId: null };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const verified = await clerkClient.verifyToken(token);
    const user = db.prepare('SELECT * FROM users WHERE clerk_id = ?').get(verified.sub);
    req.auth = { userId: verified.sub, sessionId: verified.sid, localUser: user || null };
    req.user = user ? { userId: user.id, email: user.email } : { userId: null };
  } catch {}
  next();
}

module.exports = { clerkClient, clerkAuth, optionalAuth };
