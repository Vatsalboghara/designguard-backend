const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const db = require('./config/db');
const { initializeSocket } = require('./config/socket');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = initializeSocket(server);

//middleware
app.use(express.json());
app.use(cors());

// Auto-migration function
async function ensureDatabaseSchema() {
    const client = await db.pool.connect();
    try {
        console.log('🔍 Checking database schema...');
        
        // Check if users table has password_hash column
        const result = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'password_hash'
        `);
        
        if (result.rows.length === 0) {
            console.log('⚠️  password_hash column not found, running migration...');
            
            // Read and execute schema file
            const schemaPath = path.join(__dirname, '../database_schema.sql');
            if (fs.existsSync(schemaPath)) {
                const schema = fs.readFileSync(schemaPath, 'utf8');
                await client.query(schema);
                console.log('✅ Database migration completed successfully!');
            } else {
                console.warn('⚠️  Schema file not found, skipping migration');
            }
        } else {
            console.log('✅ Database schema is up to date');
        }
        
    } catch (error) {
        console.error('❌ Migration error:', error.message);
        // Don't fail the server startup, just log the error
    } finally {
        client.release();
    }
}

//test bd connection and run migration
db.pool.query('SELECT NOW()', async (err, res) => {
    if (err) {
        console.error('Database Connection Failed:', err);
    } else {
        console.log('Database Connected Successfully');
        
        // Run migration check
        await ensureDatabaseSchema();
    }
});

//routes
const authMiddleware = require('./middleware/authMiddleware');

app.use('/api/auth', require('./routes/authRoutes'));
// Protected Routes
app.use('/api', authMiddleware, require('./routes/designRoutes'));
app.use('/api', authMiddleware, require('./routes/accessRoutes'));
app.use('/api', authMiddleware, require('./routes/orderRoutes'));
app.use('/api', authMiddleware, require('./routes/profileRoutes'));
app.use('/api/chat', authMiddleware, require('./routes/chatRoutes'));
app.use('/api/notifications', authMiddleware, require('./routes/notificationRoutes'));

// Global Error Handler (for Multer and other errors)
app.use((err, req, res, next) => {
    console.error('Global Error Handler:', err);
    
    if (err instanceof multer.MulterError) {
        // Multer specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ msg: 'File too large. Max size is 5MB' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ msg: 'Unexpected file field' });
        }
        return res.status(400).json({ msg: err.message });
    } else if (err && err.code === 'INVALID_FILE_TYPE') {
        // Custom file type error
        return res.status(400).json({ msg: err.message });
    } else if (err) {
        // Other errors
        console.error('Unhandled Error:', err);
        return res.status(500).json({ 
            msg: 'Server Error', 
            error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
    next();
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`🔌 Socket.io server ready for connections`);
});

