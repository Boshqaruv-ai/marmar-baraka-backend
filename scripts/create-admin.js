require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/database');

const createAdmin = async () => {
  try {
    const email = 'admin@marmarbaraka.uz';
    const password = 'Admin123!';
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password, full_name, role, is_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE
       SET password = $2, role = $4, is_verified = $5
       RETURNING id, email, full_name, role`,
      [email, hashedPassword, 'Admin User', 'admin', true]
    );

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('👤 User ID:', result.rows[0].id);
    console.log('\n⚠️  Please change the password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  }
};

createAdmin();
