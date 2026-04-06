const { Pool } = require('pg');
const logger = require('../utils/logger');

// 1.3 — Hardcoded defaults removed in production
const requiredInProduction = ['DB_PASSWORD', 'DB_HOST', 'DB_USER', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET'];
if (process.env.NODE_ENV === 'production') {
  for (const envVar of requiredInProduction) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'marmar_baraka',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
  // 1.4 — SSL mandatory in production
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : (process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false),
  min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
  max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000,
  query_timeout: 30000,
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message, stack: err.stack });
});

pool.on('acquire', () => {
  logger.debug('Client acquired from pool');
});

pool.on('remove', () => {
  logger.debug('Client removed from pool');
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query execution failed', { text, duration, error: error.message });
    throw error;
  }
};

const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);
  const timeout = setTimeout(() => {
    logger.error('A client has been checked out for more than 5 seconds');
  }, 5000);

  client.query = (...args) => originalQuery(...args);
  client.release = () => {
    clearTimeout(timeout);
    originalRelease();
  };

  return client;
};

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    // 1.16 — Transaction rollback logging
    logger.error('Transaction rolled back', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    client.release();
  }
};

const healthCheck = async () => {
  try {
    await pool.query('SELECT NOW()');
    return { status: 'healthy', database: 'connected' };
  } catch (error) {
    return { status: 'unhealthy', database: error.message };
  }
};

module.exports = {
  pool,
  query,
  getClient,
  transaction,
  healthCheck,
};
