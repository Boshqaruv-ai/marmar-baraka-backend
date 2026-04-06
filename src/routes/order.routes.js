const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const { validate, validateParams } = require('../middleware/validation.middleware');
const rateLimit = require('express-rate-limit');

// 1.6 — UUID params validation
const Joi = require('joi');
const itemIdSchema = Joi.object({ itemId: Joi.string().uuid().required() });
const orderIdSchema = Joi.object({ id: Joi.string().uuid().required() });

// 1.11 — Order creation rate limiter
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many orders, please try again later' } },
});

router.get('/', authMiddleware, orderController.getUserOrders);
router.get('/all', authMiddleware, requireRole('admin', 'manager'), orderController.getAllOrders);
router.get('/cart', authMiddleware, orderController.getCart);
router.post('/cart/add', authMiddleware, orderController.addToCart);
// 1.12 — Cart item update validation
router.put('/cart/:itemId', authMiddleware, validateParams(itemIdSchema), validate('updateCartItem'), orderController.updateCartItem);
router.delete('/cart/:itemId', authMiddleware, validateParams(itemIdSchema), orderController.removeFromCart);
router.delete('/cart', authMiddleware, orderController.clearCart);
// 1.11 — Order creation rate limit
router.post('/', authMiddleware, orderLimiter, validate('order'), orderController.createOrder);
router.get('/:id', authMiddleware, validateParams(orderIdSchema), orderController.getOrder);
router.post('/:id/cancel', authMiddleware, validateParams(orderIdSchema), orderController.cancelOrder);
router.put('/:id/status', authMiddleware, requireRole('admin', 'manager'), validateParams(orderIdSchema), orderController.updateOrderStatus);

module.exports = router;
