const bcrypt = require('bcryptjs');
// 6.8 — crypto import at top level
const crypto = require('crypto');

const SALT_ROUNDS = 12;

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
};

const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const generateRandomToken = (length = 64) => {
  return crypto.randomBytes(length).toString('hex');
};

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = {
  hashPassword,
  comparePassword,
  generateRandomToken,
  hashToken,
  SALT_ROUNDS,
};
