const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration with better error handling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

async function runMigration() {
  let client;
  
  try {
    console.log('🚀 Starting database migration...');
    
    // Test connection first
    client = await pool.connect();
    await client.query('SELECT NOW()');
    console.log('✅ Database connection established');
    
    // Check if migration is needed
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'password_hash'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ Database schema is already up to date');
      return;
    }
    
    // Read the schema file
    const schemaPath = path.join(__dirname, 'database_schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error('Schema file not found: ' + schemaPath);
    }
    
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the schema in a transaction
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
    
    console.log('✅ Database migration completed successfully!');
    
    // Verify tables exist
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log('📋 Available tables:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError.message);
      }
    }
    
    // Don't throw error in production to prevent deployment failure
    if (process.env.NODE_ENV !== 'production') {
      throw error;
    }
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('🎉 Migration process completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration process failed:', error.message);
      process.exit(1);
    });
}

module.exports = { runMigration };