const db = require('../config/database');
const redis = require('../config/redis');
const { hashPassword, comparePassword, generateRandomToken, hashToken } = require('../utils/hash');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { AppError } = require('../middleware/error.middleware');
const logger = require('../utils/logger');

const CACHE_TTL = 3600;

const register = async ({ email, password, firstName, lastName, phone, companyName }) => {
  const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);

  if (existingUser.rows.length > 0) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await hashPassword(password);

  const result = await db.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, company_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, first_name, last_name, phone, company_name, role, created_at`,
    [email.toLowerCase(), passwordHash, firstName, lastName, phone || null, companyName || null]
  );

  const user = result.rows[0];
  const accessToken = generateAccessToken({ userId: user.id, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user.id });

  await db.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
    [user.id, hashToken(refreshToken)]
  );

  logger.info('User registered successfully', { userId: user.id, email: user.email });

  return {
    user: formatUserResponse(user),
    accessToken,
    refreshToken,
  };
};

const login = async ({ email, password }) => {
  const result = await db.query(
    `SELECT id, email, password_hash, first_name, last_name, role, is_active, is_verified,
            failed_login_attempts, locked_until
     FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const user = result.rows[0];

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError('Account is temporarily locked. Please try again later', 403, 'ACCOUNT_LOCKED');
  }

  const isValidPassword = await comparePassword(password, user.password_hash);

  if (!isValidPassword) {
    const attempts = user.failed_login_attempts + 1;

    if (attempts >= 5) {
      await db.query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = NOW() + INTERVAL \'30 minutes\' WHERE id = $2',
        [attempts, user.id]
      );
      throw new AppError('Too many failed attempts. Account locked for 30 minutes', 403, 'ACCOUNT_LOCKED');
    }

    await db.query(
      'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
      [attempts, user.id]
    );

    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  await db.query(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
    [user.id]
  );

  const accessToken = generateAccessToken({ userId: user.id, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user.id });

  await db.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
    [user.id, hashToken(refreshToken)]
  );

  logger.info('User logged in successfully', { userId: user.id, email: user.email });

  return {
    user: formatUserResponse(user),
    accessToken,
    refreshToken,
  };
};

const refreshToken = async (token) => {
  const hashedToken = hashToken(token);

  const result = await db.query(
    `SELECT rt.*, u.id as user_id, u.role, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.id
     WHERE rt.token = $1 AND rt.is_revoked = FALSE AND rt.expires_at > NOW()`,
    [hashedToken]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const tokenRecord = result.rows[0];

  if (!tokenRecord.is_active) {
    throw new AppError('User account is disabled', 403, 'ACCOUNT_DISABLED');
  }

  await db.query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = $1', [tokenRecord.id]);

  const newAccessToken = generateAccessToken({ userId: tokenRecord.user_id, role: tokenRecord.role });
  const newRefreshToken = generateRefreshToken({ userId: tokenRecord.user_id });

  await db.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
    [tokenRecord.user_id, hashToken(newRefreshToken)]
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

const logout = async (userId, token) => {
  if (token) {
    await db.query(
      'UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE user_id = $1 AND token = $2',
      [userId, hashToken(token)]
    );
  } else {
    await db.query(
      'UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE user_id = $1 AND is_revoked = FALSE',
      [userId]
    );
  }

  logger.info('User logged out', { userId });
};

const forgotPassword = async (email) => {
  const result = await db.query(
    'SELECT id, email, first_name FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    return { message: 'If the email exists, a reset link has been sent' };
  }

  const user = result.rows[0];
  const resetToken = generateRandomToken(32);
  const hashedToken = hashToken(resetToken);

  await db.query(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\')',
    [user.id, hashedToken]
  );

  await redis.set(`password_reset:${resetToken}`, user.id, 3600);

  logger.info('Password reset requested', { userId: user.id });

  return { message: 'If the email exists, a reset link has been sent', user, resetToken };
};

const resetPassword = async (token, newPassword) => {
  const hashedToken = hashToken(token);

  // 1.10 — Reset password race condition fix with transaction + FOR UPDATE
  return db.transaction(async (client) => {
    const result = await client.query(
      'SELECT user_id, used, expires_at FROM password_reset_tokens WHERE token = $1 FOR UPDATE',
      [hashedToken]
    );

    if (result.rows.length === 0 || result.rows[0].used || new Date(result.rows[0].expires_at) < new Date()) {
      throw new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN');
    }

    const passwordHash = await hashPassword(newPassword);

    await client.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, result.rows[0].user_id]
    );

    await client.query(
      'UPDATE password_reset_tokens SET used = TRUE, used_at = NOW() WHERE token = $1',
      [hashedToken]
    );

    await client.query(
      'UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE user_id = $1',
      [result.rows[0].user_id]
    );

    logger.info('Password reset successful', { userId: result.rows[0].user_id });
  });
};

const getProfile = async (userId) => {
  const cacheKey = `user:profile:${userId}`;
  const cached = await redis.get(cacheKey);

  if (cached) return cached;

  const result = await db.query(
    `SELECT id, email, first_name, last_name, phone, company_name, role,
            is_verified, is_active, created_at, last_login
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const profile = formatUserResponse(result.rows[0]);
  await redis.set(cacheKey, profile, CACHE_TTL);

  return profile;
};

const updateProfile = async (userId, updates) => {
  const allowedFields = ['firstName', 'lastName', 'phone', 'companyName'];
  const filtered = {};

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      if (typeof value === 'string' && value.trim().length === 0) continue;
      filtered[key] = value;
    }
  }

  if (filtered.firstName && filtered.firstName.length > 100) {
    throw new AppError('First name must be less than 100 characters', 400, 'VALIDATION_ERROR');
  }
  if (filtered.lastName && filtered.lastName.length > 100) {
    throw new AppError('Last name must be less than 100 characters', 400, 'VALIDATION_ERROR');
  }

  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (filtered.firstName !== undefined) {
    fields.push(`first_name = $${paramIndex++}`);
    values.push(filtered.firstName);
  }
  if (filtered.lastName !== undefined) {
    fields.push(`last_name = $${paramIndex++}`);
    values.push(filtered.lastName);
  }
  if (filtered.phone !== undefined) {
    fields.push(`phone = $${paramIndex++}`);
    values.push(filtered.phone);
  }
  if (filtered.companyName !== undefined) {
    fields.push(`company_name = $${paramIndex++}`);
    values.push(filtered.companyName);
  }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400, 'NO_UPDATES');
  }

  values.push(userId);

  const result = await db.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}
     RETURNING id, email, first_name, last_name, phone, company_name, role, is_verified, created_at`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  await redis.del(`user:profile:${userId}`);

  logger.info('User profile updated', { userId });
  return formatUserResponse(result.rows[0]);
};

const formatUserResponse = (user) => ({
  id: user.id,
  email: user.email,
  firstName: user.first_name,
  lastName: user.last_name,
  phone: user.phone,
  companyName: user.company_name,
  role: user.role,
  isVerified: user.is_verified,
  isActive: user.is_active,
  createdAt: user.created_at,
  lastLogin: user.last_login,
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
};
