require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const initDatabase = async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    } : false
  });

  try {
    console.log('📦 Reading SQL file...');
    const sqlPath = path.join(__dirname, 'init-database.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🔄 Executing SQL...');
    await pool.query(sql);

    console.log('✅ Database initialized successfully!');
    console.log('📧 Admin email: admin@marmarbaraka.uz');
    console.log('🔑 Admin password: Admin123!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    process.exit(1);
  }
};

initDatabase();
