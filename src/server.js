const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
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

//test bd connection
db.pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database Connection Failed:', err);
    } else {
        console.log('Database Connected Successfully');
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

