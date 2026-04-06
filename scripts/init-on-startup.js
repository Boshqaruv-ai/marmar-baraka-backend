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
      logger.info('Database already initialized, checking for missing columns and tables...');

      // Add missing columns to existing tables
      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
        ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_uz VARCHAR(255);
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
        ALTER TABLE products ADD COLUMN IF NOT EXISTS name_uz VARCHAR(255);
        ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
        ALTER TABLE products ADD COLUMN IF NOT EXISTS price_per_m2 DECIMAL(10, 2);
        ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_m2 DECIMAL(10, 2);
        ALTER TABLE products ADD COLUMN IF NOT EXISTS min_order_m2 DECIMAL(10, 2);
        ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500);
        ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
      `);

      // Create missing tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          order_number VARCHAR(50) UNIQUE NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          total_amount DECIMAL(10, 2) NOT NULL,
          shipping_address JSONB,
          billing_address JSONB,
          payment_method VARCHAR(50),
          payment_status VARCHAR(50) DEFAULT 'pending',
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id SERIAL PRIMARY KEY,
          order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
          product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
          quantity INTEGER NOT NULL,
          price DECIMAL(10, 2) NOT NULL,
          total DECIMAL(10, 2) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS cart_items (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
          quantity INTEGER NOT NULL DEFAULT 1,
          added_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
        CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
      `);

      logger.info('Database schema updated successfully');
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
