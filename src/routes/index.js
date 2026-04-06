const express = require('express');
const router = express.Router();
const authRoutes = require('./auth.routes');
const productRoutes = require('./product.routes');
const orderRoutes = require('./order.routes');
const { router: metricsRouter } = require('./metrics.routes');
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/', metricsRouter);

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Marmar Baraka API',
    version: process.env.API_VERSION || 'v1',
    endpoints: {
      auth: '/api/v1/auth',
      products: '/api/v1/products',
      orders: '/api/v1/orders',
      health: '/api/v1/health',
      metrics: '/api/v1/metrics',
    },
  });
});

// 1.13 — Public health endpoint (no sensitive data)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 1.13 — Detailed health (admin only)
router.get('/health/detailed', authMiddleware, requireRole('admin'), async (req, res) => {
  const db = require('../config/database');
  const redis = require('../config/redis');

  const dbHealth = await db.healthCheck();
  const redisHealth = await redis.healthCheck();

  const isHealthy = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    data: {
      database: dbHealth,
      redis: redisHealth,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
