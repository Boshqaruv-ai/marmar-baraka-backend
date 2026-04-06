const redis = require('redis');
const logger = require('../utils/logger');

let client = null;
let connectionAttempted = false;

const connect = async () => {
  if (client) return client;
  if (connectionAttempted) return null;

  connectionAttempted = true;

  try {
    client = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        reconnectStrategy: false, // Disable auto-reconnect
        connectTimeout: 5000,
      },
      ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
      database: parseInt(process.env.REDIS_DB || '0', 10),
    });

    client.on('error', (err) => {
      logger.warn('Redis client error (non-critical)', { error: err.message });
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
    });

    await client.connect();
    return client;
  } catch (error) {
    logger.warn('Redis connection failed, continuing without Redis', { error: error.message });
    client = null;
    return null;
  }
};

const get = async (key) => {
  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Redis GET error', { key, error: error.message });
    return null;
  }
};

const set = async (key, value, ttl = 3600) => {
  try {
    const data = JSON.stringify(value);
    if (ttl > 0) {
      await client.setEx(key, ttl, data);
    } else {
      await client.set(key, data);
    }
    return true;
  } catch (error) {
    logger.error('Redis SET error', { key, error: error.message });
    return false;
  }
};

const del = async (key) => {
  try {
    await client.del(key);
    return true;
  } catch (error) {
    logger.error('Redis DEL error', { key, error: error.message });
    return false;
  }
};

const invalidatePattern = async (pattern) => {
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
    return true;
  } catch (error) {
    logger.error('Redis invalidate pattern error', { pattern, error: error.message });
    return false;
  }
};

const increment = async (key, ttl = 3600) => {
  try {
    const value = await client.incr(key);
    if (value === 1) {
      await client.expire(key, ttl);
    }
    return value;
  } catch (error) {
    logger.error('Redis increment error', { key, error: error.message });
    return null;
  }
};

const healthCheck = async () => {
  try {
    if (!client) return { status: 'unhealthy', redis: 'not connected' };
    await client.ping();
    return { status: 'healthy', redis: 'connected' };
  } catch (error) {
    return { status: 'unhealthy', redis: error.message };
  }
};

module.exports = {
  connect,
  get,
  set,
  del,
  invalidatePattern,
  increment,
  healthCheck,
  getClient: () => client,
};
