const db = require('../config/db');

// Get chat history for a room
exports.getChatHistory = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;
        const userId = req.user.id;

        console.log('Get Chat History Request:', { roomId, page, limit, userId });

        // Verify user has access to this room
        const roomCheck = await db.query(`
            SELECT * FROM chat_rooms 
            WHERE id = $1 AND (vepari_id = $2 OR factory_id = $2)
        `, [roomId, userId]);

        if (roomCheck.rows.length === 0) {
            console.log('Access denied: User not part of this room');
            return res.status(403).json({ msg: "Access denied to this chat room" });
        }

        // Get messages with sender details
        const messages = await db.query(`
            SELECT 
                m.id,
                m.message_text,
                m.sender_id,
                m.is_read,
                m.created_at,
                u.email as sender_email,
                u.role as sender_role
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.room_id = $1
            ORDER BY m.created_at ASC
            LIMIT $2 OFFSET $3
        `, [roomId, limit, offset]);

        // Get total message count
        const countResult = await db.query(
            'SELECT COUNT(*) FROM messages WHERE room_id = $1',
            [roomId]
        );

        const totalMessages = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalMessages / limit);

        console.log(`Found ${messages.rows.length} messages for room ${roomId}`);

        res.json({
            messages: messages.rows, // Already ordered oldest first from query
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalMessages,
                hasMore: page < totalPages
            },
            roomInfo: roomCheck.rows[0]
        });

    } catch (err) {
        console.error('Get Chat History Error:', err);
        res.status(500).json({ 
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Get all chat rooms for a user
exports.getChatRooms = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        console.log('Get Chat Rooms Request:', { userId, userRole });

        let query;
        if (userRole === 'vepari') {
            // Simplified query first to test
            query = `
                SELECT 
                    cr.id,
                    cr.vepari_id,
                    cr.factory_id,
                    cr.last_message,
                    cr.last_message_at,
                    cr.created_at,
                    f.email as factory_email,
                    f.full_name as factory_name,
                    CAST((SELECT COUNT(*) FROM messages m WHERE m.room_id = cr.id AND m.sender_id != $1 AND m.is_read = false) AS INTEGER) as unread_count
                FROM chat_rooms cr
                JOIN users f ON cr.factory_id = f.id
                WHERE cr.vepari_id = $1
                ORDER BY cr.last_message_at DESC NULLS LAST, cr.created_at DESC
            `;
        } else if (userRole === 'factory_owner') {
            // Simplified query first to test
            query = `
                SELECT 
                    cr.id,
                    cr.vepari_id,
                    cr.factory_id,
                    cr.last_message,
                    cr.last_message_at,
                    cr.created_at,
                    v.email as vepari_email,
                    v.full_name as vepari_name,
                    CAST((SELECT COUNT(*) FROM messages m WHERE m.room_id = cr.id AND m.sender_id != $1 AND m.is_read = false) AS INTEGER) as unread_count
                FROM chat_rooms cr
                JOIN users v ON cr.vepari_id = v.id
                WHERE cr.factory_id = $1
                ORDER BY cr.last_message_at DESC NULLS LAST, cr.created_at DESC
            `;
        } else {
            console.log('Invalid user role:', userRole);
            return res.status(403).json({ msg: "Invalid user role for chat access" });
        }

        console.log('Executing query for user role:', userRole);
        const rooms = await db.query(query, [userId]);

        console.log(`Found ${rooms.rows.length} chat rooms for user ${userId}`);
        
        // Log first room for debugging if exists
        if (rooms.rows.length > 0) {
            console.log('Sample room data:', rooms.rows[0]);
        }

        // Return success response with proper structure
        res.json({
            success: true,
            rooms: rooms.rows
        });

    } catch (err) {
        console.error('Get Chat Rooms Error:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({ 
            success: false,
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Create or get chat room between vepari and factory
exports.createOrGetChatRoom = async (req, res) => {
    try {
        const { vepariId, factoryId } = req.body;
        const userId = req.user.id;

        console.log('Create/Get Chat Room Request:', { vepariId, factoryId, userId });

        // Verify user is part of this conversation
        if (userId !== parseInt(vepariId) && userId !== parseInt(factoryId)) {
            console.log('Access denied: User not part of this conversation');
            return res.status(403).json({ msg: "Access denied" });
        }

        // Verify both users exist and have correct roles
        const usersCheck = await db.query(`
            SELECT id, role FROM users 
            WHERE id IN ($1, $2)
        `, [vepariId, factoryId]);

        if (usersCheck.rows.length !== 2) {
            return res.status(400).json({ msg: "Invalid user IDs" });
        }

        const vepari = usersCheck.rows.find(u => u.id === parseInt(vepariId));
        const factory = usersCheck.rows.find(u => u.id === parseInt(factoryId));

        if (!vepari || !factory || vepari.role !== 'vepari' || factory.role !== 'factory_owner') {
            return res.status(400).json({ msg: "Invalid user roles" });
        }

        // Create or get existing room
        const roomResult = await db.query(`
            INSERT INTO chat_rooms (vepari_id, factory_id) 
            VALUES ($1, $2) 
            ON CONFLICT (vepari_id, factory_id) 
            DO UPDATE SET last_message_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [vepariId, factoryId]);

        console.log('Chat room created/retrieved:', roomResult.rows[0]);

        res.json(roomResult.rows[0]);

    } catch (err) {
        console.error('Create/Get Chat Room Error:', err);
        res.status(500).json({ 
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Clear chat history for a room
exports.clearChatHistory = async (req, res) => {
    try {
        const { roomId } = req.body;
        const userId = req.user.id;

        console.log('🗑️ Clear Chat History Request:', { roomId, userId, body: req.body });

        if (!roomId) {
            console.log('🗑️ Error: Room ID is missing');
            return res.status(400).json({ msg: "Room ID is required" });
        }

        // Verify user has access to this room
        const roomCheck = await db.query(`
            SELECT * FROM chat_rooms 
            WHERE id = $1 AND (vepari_id = $2 OR factory_id = $2)
        `, [roomId, userId]);

        console.log('🗑️ Room check result:', roomCheck.rows);

        if (roomCheck.rows.length === 0) {
            console.log('🗑️ Error: Access denied to room');
            return res.status(403).json({ msg: "Access denied to this chat room" });
        }

        // Delete all messages in this room
        const deleteResult = await db.query(`
            DELETE FROM messages WHERE room_id = $1
        `, [roomId]);

        // Update chat room to clear last message
        await db.query(`
            UPDATE chat_rooms 
            SET last_message = NULL, last_message_at = CURRENT_TIMESTAMP 
            WHERE id = $1
        `, [roomId]);

        console.log(`🗑️ Chat history cleared for room ${roomId}. Deleted ${deleteResult.rowCount} messages.`);

        res.json({ 
            success: true, 
            message: 'Chat history cleared successfully',
            deletedCount: deleteResult.rowCount
        });

    } catch (err) {
        console.error('🗑️ Clear Chat History Error:', err);
        res.status(500).json({ 
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};