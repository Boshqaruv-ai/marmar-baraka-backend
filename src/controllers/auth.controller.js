const authService = require('../services/auth.service');
const emailService = require('../services/email.service');
const { asyncHandler } = require('../middleware/error.middleware');
const { AppError } = require('../middleware/error.middleware');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  // 6.5 — Email failure doesn't block registration
  emailService.sendWelcomeEmail(result.user).catch(err => {
    require('../utils/logger').error('Failed to send welcome email', { userId: result.user.id, error: err.message });
  });

  res.status(201).json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString() },
  });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);

  res.status(200).json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString() },
  });
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const result = await authService.refreshToken(refreshToken);

  res.status(200).json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString() },
  });
});

const logout = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken;
  await authService.logout(req.user.id, token);

  res.status(200).json({
    success: true,
    data: { message: 'Logged out successfully' },
    meta: { timestamp: new Date().toISOString() },
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email);

  if (result.user && result.resetToken) {
    await emailService.sendPasswordResetEmail(result.user, result.resetToken);
  }

  res.status(200).json({
    success: true,
    data: { message: result.message },
    meta: { timestamp: new Date().toISOString() },
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  await authService.resetPassword(token, password);

  res.status(200).json({
    success: true,
    data: { message: 'Password reset successfully' },
    meta: { timestamp: new Date().toISOString() },
  });
});

const getMe = asyncHandler(async (req, res) => {
  const profile = await authService.getProfile(req.user.id);

  res.status(200).json({
    success: true,
    data: profile,
    meta: { timestamp: new Date().toISOString() },
  });
});

const updateMe = asyncHandler(async (req, res) => {
  const profile = await authService.updateProfile(req.user.id, req.body);

  res.status(200).json({
    success: true,
    data: profile,
    meta: { timestamp: new Date().toISOString() },
  });
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  updateMe,
};
