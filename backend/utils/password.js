const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function hashPassword(password) {
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function comparePasswords(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

module.exports = { hashPassword, comparePasswords, generateToken };
