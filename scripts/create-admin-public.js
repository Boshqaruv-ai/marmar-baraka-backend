const { Client } = require('pg');

const createAdmin = async () => {
  // Railway public URL (parolni to'ldiring)
  const client = new Client({
    connectionString: 'postgresql://postgres:fhCHjtCulmEfusnobvJcrMpGusTlrmjv@maglev.proxy.rlwy.net:25451/railway'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    const result = await client.query(`
      INSERT INTO users (email, password, first_name, last_name, phone, role, is_verified, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE
      SET password = $2, role = $6, is_verified = $7
      RETURNING id, email, first_name, last_name, role
    `, [
      'admin@marmarbaraka.uz',
      '$2a$10$EoguKnAP6Q8UL/3z1zDgnePvUYvV0vR3kuNNcsMJ90yucthxjSqS2',
      'Admin',
      'User',
      '+998901234567',
      'admin',
      true
    ]);

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@marmarbaraka.uz');
    console.log('🔑 Password: Admin123!');
    console.log('👤 User:', result.rows[0]);
    
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

createAdmin();
