require('dotenv').config();
const { Pool } = require('pg');

const addLastLoginColumn = async () => {
  const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : null;

  if (!poolConfig) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }

  const pool = new Pool(poolConfig);

  try {
    console.log('Adding last_login column to users table...');

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
    `);

    console.log('✅ Column added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

addLastLoginColumn();
