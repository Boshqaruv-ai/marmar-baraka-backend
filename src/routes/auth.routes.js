const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { authLimiter } = require('../middleware/rateLimit.middleware');

router.post('/register', authLimiter, validate('register'), authController.register);
router.post('/login', authLimiter, validate('login'), authController.login);
router.post('/refresh-token', authLimiter, validate('refreshToken'), authController.refresh);
router.post('/logout', authLimiter, authMiddleware, authController.logout);
router.post('/forgot-password', authLimiter, validate('forgotPassword'), authController.forgotPassword);
router.post('/reset-password', authLimiter, validate('resetPassword'), authController.resetPassword);
router.get('/me', authMiddleware, authController.getMe);
router.put('/me', authMiddleware, authController.updateMe);

module.exports = router;
