const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production';

function generateJWT(userId) {
  return jwt.sign(
    { userId, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = { generateJWT, verifyJWT };
