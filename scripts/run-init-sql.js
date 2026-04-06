const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const runSQL = async () => {
  const client = new Client({
    connectionString: 'postgresql://postgres:fhCHjtCulmEfusnobvJcrMpGusTlrmjv@maglev.proxy.rlwy.net:25451/railway'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    const sql = fs.readFileSync(path.join(__dirname, 'init-database.sql'), 'utf8');
    await client.query(sql);
    
    console.log('✅ Database initialized successfully!');
    console.log('✅ Admin user created!');
    console.log('\n📧 Email: admin@marmarbaraka.uz');
    console.log('🔑 Password: Admin123!');
    
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

runSQL();
