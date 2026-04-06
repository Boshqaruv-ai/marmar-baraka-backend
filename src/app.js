require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const logger = require('./utils/logger');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const { generalLimiter } = require('./middleware/rateLimit.middleware');
const redis = require('./config/redis');

// 1.3 + 6.9 — Startup environment validation
const validateEnv = () => {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  if (process.env.NODE_ENV === 'production') {
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required env vars: ${missing.join(', ')}`);
    }
  }
};
validateEnv();

const app = express();

const PORT = process.env.PORT || 5000;
const API_VERSION = process.env.API_VERSION || 'v1';

// 6.2 — HSTS header
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-CSRF-Token'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-CSRF-Token'],
  maxAge: 86400,
}));

app.use(compression());
app.use(express.json({ limit: '10mb', type: 'application/json' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('combined', { stream: logger.stream }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use(generalLimiter);

// 1.1 + 1.2 — CSRF protection with double-submit cookie pattern
const crypto = require('crypto');

const csrfProtection = (req, res, next) => {
  // Skip CSRF for health and auth endpoints temporarily for debugging
  if (req.path.startsWith('/health') || req.path.startsWith('/auth')) {
    return next();
  }

  // Use existing token from cookie if present, otherwise generate new one
  let token = req.cookies['XSRF-TOKEN'];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
  }
  res.set('X-CSRF-Token', token);

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const headerToken = req.headers['x-csrf-token'] || req.headers['X-CSRF-Token'];

    if (!headerToken || headerToken !== token) {
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_CSRF_TOKEN', message: 'Invalid CSRF token' },
      });
    }
  }

  next();
};

app.use(csrfProtection);

app.use(`/api/${API_VERSION}`, routes);

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  try {
    // Initialize database on first startup (production only)
    const initDatabaseOnStartup = require('../scripts/init-on-startup');
    await initDatabaseOnStartup();

    // Try to connect to Redis, but don't fail if unavailable
    try {
      await redis.connect();
      logger.info('Redis connected successfully');
    } catch (redisError) {
      logger.warn('Redis connection failed, continuing without Redis', { error: redisError.message });
    }

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`, {
        environment: process.env.NODE_ENV || 'development',
        apiVersion: API_VERSION,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason, stack: reason?.stack });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  const { pool } = require('./config/database');
  await pool.end();
  const redisClient = redis.getClient();
  if (redisClient) await redisClient.quit();
  process.exit(0);
});

startServer();

module.exports = app;
