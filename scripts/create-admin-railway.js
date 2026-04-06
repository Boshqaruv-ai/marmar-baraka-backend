const { Client } = require('pg');

const createAdmin = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:fhCHjtCulmEfusnobvJcrMpGusTlrmjv@postgres.railway.internal:5432/railway'
  });

  try {
    await client.connect();
    
    const result = await client.query(`
      INSERT INTO users (email, password, full_name, role, is_verified, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE
      SET password = $2, role = $4, is_verified = $5
      RETURNING id, email, full_name, role
    `, [
      'admin@marmarbaraka.uz',
      '$2a$10$EoguKnAP6Q8UL/3z1zDgnePvUYvV0vR3kuNNcsMJ90yucthxjSqS2',
      'Admin User',
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
    await client.end();
    process.exit(1);
  }
};

createAdmin();
