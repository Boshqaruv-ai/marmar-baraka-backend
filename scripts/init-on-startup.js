const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const logger = require('../src/utils/logger');

const initDatabaseOnStartup = async () => {
  // Only run in production on first startup
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : null;

  if (!poolConfig) {
    logger.warn('DATABASE_URL not found, skipping database initialization');
    return;
  }

  const pool = new Pool(poolConfig);

  try {
    // Check if users table exists
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    if (result.rows[0].exists) {
      logger.info('Database already initialized, skipping');
      return;
    }

    logger.info('Initializing database for the first time...');
    const sqlPath = path.join(__dirname, 'init-database.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await pool.query(sql);
    logger.info('✅ Database initialized successfully!');
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
  } finally {
    await pool.end();
  }
};

module.exports = initDatabaseOnStartup;
