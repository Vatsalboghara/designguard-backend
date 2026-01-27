const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./db');

let io;

const initializeSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", // In production, specify your frontend URL
            methods: ["GET", "POST"]
        },
        // Add these options to handle payload issues
        maxHttpBufferSize: 1e6, // 1MB
        pingTimeout: 60000,
        pingInterval: 25000,
        upgradeTimeout: 30000,
        allowEIO3: true // Allow Engine.IO v3 clients
    });

    // Socket authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            // Remove Bearer if present
            const tokenString = token.startsWith('Bearer ') ? token.slice(7) : token;
            const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);
            
            // Get user details from database
            const userResult = await db.query('SELECT id, email, role FROM users WHERE id = $1', [decoded.user.id]);
            if (userResult.rows.length === 0) {
                return next(new Error('Authentication error: User not found'));
            }

            socket.user = userResult.rows[0];
            console.log(`🔌 User connected: ${socket.user.email} (${socket.user.role})`);
            next();
        } catch (err) {
            console.error('Socket authentication error:', err);
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`✅ Socket connected: ${socket.id} - User: ${socket.user.email}`);

        // Join user-specific room for notifications
        socket.join(`user_${socket.user.id}`);
        console.log(`📢 User ${socket.user.email} joined notification room: user_${socket.user.id}`);

        // Join a chat room
        socket.on('join_room', async (data) => {
            try {
                // Validate payload
                if (!data || typeof data !== 'object') {
                    console.error('Invalid join_room payload:', data);
                    socket.emit('error', { message: 'Invalid payload format' });
                    return;
                }

                const { vepariId, factoryId } = data;
                
                // Validate required fields
                if (!vepariId || !factoryId) {
                    console.error('Missing required fields in join_room:', { vepariId, factoryId });
                    socket.emit('error', { message: 'Missing vepariId or factoryId' });
                    return;
                }

                const roomName = `room_${vepariId}_${factoryId}`;
                
                console.log(`🏠 User ${socket.user.email} joining room: ${roomName}`);
                
                // Verify user is part of this conversation
                if (socket.user.id !== parseInt(vepariId) && socket.user.id !== parseInt(factoryId)) {
                    console.error('Unauthorized room access:', { userId: socket.user.id, vepariId, factoryId });
                    socket.emit('error', { message: 'Unauthorized to join this room' });
                    return;
                }

                // Create or get existing chat room
                const roomResult = await db.query(`
                    INSERT INTO chat_rooms (vepari_id, factory_id) 
                    VALUES ($1, $2) 
                    ON CONFLICT (vepari_id, factory_id) 
                    DO UPDATE SET last_message_at = CURRENT_TIMESTAMP
                    RETURNING id
                `, [vepariId, factoryId]);

                const roomId = roomResult.rows[0].id;
                
                socket.join(roomName);
                socket.currentRoom = roomName;
                socket.roomId = roomId;
                
                socket.emit('room_joined', { 
                    roomName, 
                    roomId,
                    message: 'Successfully joined chat room' 
                });

                console.log(`✅ User ${socket.user.email} joined room ${roomName} (DB ID: ${roomId})`);
                
            } catch (err) {
                console.error('Error joining room:', err);
                socket.emit('error', { message: 'Failed to join room' });
            }
        });

        // Send message
        socket.on('send_message', async (data) => {
            try {
                // Validate payload
                if (!data || typeof data !== 'object') {
                    console.error('Invalid send_message payload:', data);
                    socket.emit('error', { message: 'Invalid payload format' });
                    return;
                }

                const { message, vepariId, factoryId } = data;
                
                // Validate required fields
                if (!message || !vepariId || !factoryId) {
                    console.error('Missing required fields in send_message:', { message: !!message, vepariId, factoryId });
                    socket.emit('error', { message: 'Missing required fields' });
                    return;
                }

                const roomName = `room_${vepariId}_${factoryId}`;
                
                if (!socket.roomId) {
                    console.error('User not in any room:', socket.user.email);
                    socket.emit('error', { message: 'Not in any room' });
                    return;
                }

                if (!message || message.trim() === '') {
                    socket.emit('error', { message: 'Message cannot be empty' });
                    return;
                }

                console.log(`💬 Message from ${socket.user.email} in room ${roomName}: ${message.substring(0, 50)}...`);

                // Save message to database
                const messageResult = await db.query(`
                    INSERT INTO messages (room_id, sender_id, message_text) 
                    VALUES ($1, $2, $3) 
                    RETURNING id, created_at
                `, [socket.roomId, socket.user.id, message.trim()]);

                // Update last message in chat room
                await db.query(`
                    UPDATE chat_rooms 
                    SET last_message = $1, last_message_at = CURRENT_TIMESTAMP 
                    WHERE id = $2
                `, [message.trim(), socket.roomId]);

                const messageData = {
                    id: messageResult.rows[0].id,
                    message: message.trim(),
                    senderId: socket.user.id,
                    senderEmail: socket.user.email,
                    senderRole: socket.user.role,
                    timestamp: messageResult.rows[0].created_at,
                    roomId: socket.roomId
                };

                // Emit to all users in the room
                io.to(roomName).emit('receive_message', messageData);
                
                console.log(`✅ Message saved and broadcasted to room ${roomName}`);

            } catch (err) {
                console.error('Error sending message:', err);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Handle typing indicator
        socket.on('typing', async (data) => {
            try {
                // Validate payload
                if (!data || typeof data !== 'object') {
                    console.error('Invalid typing payload:', data);
                    return;
                }

                const { vepariId, factoryId } = data;
                
                if (!vepariId || !factoryId) {
                    console.error('Missing required fields in typing:', { vepariId, factoryId });
                    return;
                }

                const roomName = `room_${vepariId}_${factoryId}`;
                
                // Broadcast typing indicator to other users in the room
                socket.to(roomName).emit('user_typing', {
                    userId: socket.user.id,
                    userEmail: socket.user.email,
                    roomName: roomName
                });

                console.log(`👀 User ${socket.user.email} is typing in room ${roomName}`);

            } catch (err) {
                console.error('Error handling typing indicator:', err);
            }
        });

        // Handle stop typing indicator
        socket.on('stop_typing', async (data) => {
            try {
                // Validate payload
                if (!data || typeof data !== 'object') {
                    console.error('Invalid stop_typing payload:', data);
                    return;
                }

                const { vepariId, factoryId } = data;
                
                if (!vepariId || !factoryId) {
                    console.error('Missing required fields in stop_typing:', { vepariId, factoryId });
                    return;
                }

                const roomName = `room_${vepariId}_${factoryId}`;
                
                // Broadcast stop typing indicator to other users in the room
                socket.to(roomName).emit('user_stopped_typing', {
                    userId: socket.user.id,
                    userEmail: socket.user.email,
                    roomName: roomName
                });

                console.log(`✋ User ${socket.user.email} stopped typing in room ${roomName}`);

            } catch (err) {
                console.error('Error handling stop typing indicator:', err);
            }
        });

        // Handle chat clear event
        socket.on('chat_cleared', async (data) => {
            try {
                const { roomId } = data;
                
                // Broadcast to all users in the room that chat was cleared
                const roomResult = await db.query('SELECT vepari_id, factory_id FROM chat_rooms WHERE id = $1', [roomId]);
                if (roomResult.rows.length > 0) {
                    const { vepari_id, factory_id } = roomResult.rows[0];
                    const roomName = `room_${vepari_id}_${factory_id}`;
                    
                    io.to(roomName).emit('chat_cleared', {
                        roomId: roomId,
                        clearedBy: socket.user.id,
                        clearedByEmail: socket.user.email,
                        timestamp: new Date()
                    });

                    console.log(`🗑️ Chat cleared for room ${roomName} by ${socket.user.email}`);
                }

            } catch (err) {
                console.error('Error handling chat clear:', err);
            }
        });

        // Mark messages as read
        socket.on('mark_messages_read', async (data) => {
            try {
                // Validate payload
                if (!data || typeof data !== 'object') {
                    console.error('Invalid mark_messages_read payload:', data);
                    socket.emit('error', { message: 'Invalid payload format' });
                    return;
                }

                const { roomId } = data;
                
                if (!roomId) {
                    socket.emit('error', { message: 'Room ID required' });
                    return;
                }

                // Mark all messages in this room as read for this user
                await db.query(`
                    UPDATE messages 
                    SET is_read = true 
                    WHERE room_id = $1 AND sender_id != $2 AND is_read = false
                `, [roomId, socket.user.id]);

                socket.emit('messages_marked_read', { roomId });
                console.log(`📖 Messages marked as read for user ${socket.user.email} in room ${roomId}`);

            } catch (err) {
                console.error('Error marking messages as read:', err);
                socket.emit('error', { message: 'Failed to mark messages as read' });
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`❌ Socket disconnected: ${socket.id} - User: ${socket.user?.email}`);
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

module.exports = { initializeSocket, getIO };