const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('../config/redis');
const logger = require('../utils/logger');

let redisStore = null;

// 6.6 — Graceful fallback when Redis unavailable
const getRedisStore = () => {
  if (!redisStore) {
    try {
      const redisClient = redis.getClient();
      if (redisClient && redisClient.isReady) {
        redisStore = new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
        });
      } else {
        logger.warn('Redis unavailable, using memory store for rate limiting');
      }
    } catch (e) {
      logger.warn('Redis store initialization failed, using memory store', { error: e.message });
    }
  }
  return redisStore;
};

const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100),
  standardHeaders: true,
  legacyHeaders: false,
  store: getRedisStore(),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    });
  },
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : (parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS, 10) || 10),
  standardHeaders: true,
  legacyHeaders: false,
  store: getRedisStore(),
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
    },
  },
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      url: req.originalUrl,
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later',
      },
    });
  },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRedisStore(),
  message: {
    success: false,
    error: {
      code: 'API_RATE_LIMIT_EXCEEDED',
      message: 'API rate limit exceeded',
    },
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  apiLimiter,
};
