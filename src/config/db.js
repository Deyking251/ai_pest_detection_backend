import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cropguard_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the database connection
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Successfully connected to the MySQL database.');
    
    // Auto-create login_activity table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS login_activity (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        action_type VARCHAR(50) NOT NULL, -- 'REGISTER' or 'LOGIN'
        ip_address VARCHAR(45) NULL,
        user_agent VARCHAR(255) NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Add phone, email_verified, phone_verified, and profile columns if missing
    const columnsToAdd = [
      { name: 'phone', definition: 'VARCHAR(20) NULL AFTER password' },
      { name: 'email_verified', definition: 'BOOLEAN DEFAULT FALSE AFTER phone' },
      { name: 'phone_verified', definition: 'BOOLEAN DEFAULT FALSE AFTER email_verified' },
      { name: 'bio', definition: 'TEXT NULL AFTER phone_verified' },
      { name: 'location', definition: 'VARCHAR(255) NULL AFTER bio' },
      { name: 'primary_crop', definition: 'VARCHAR(150) NULL AFTER location' },
      { name: 'experience', definition: 'VARCHAR(100) NULL AFTER primary_crop' },
      { name: 'farm_size', definition: 'VARCHAR(100) NULL AFTER experience' },
      { name: 'profile_picture', definition: 'VARCHAR(255) NULL AFTER farm_size' },
    ];

    for (const col of columnsToAdd) {
      try {
        await connection.query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.definition}`);
        console.log(`  Added column users.${col.name}`);
      } catch (alterErr) {
        // Column likely already exists (ER_DUP_FIELDNAME)
        if (alterErr.errno !== 1060) {
          console.error(`  Failed to add column ${col.name}:`, alterErr.message);
        }
      }
    }
    
    connection.release();
  } catch (error) {
    console.error('Database connection failed:', error.message);
    console.error('Ensure that your MySQL server is running, the database exists, and .env credentials are correct.');
  }
})();

export default pool;
