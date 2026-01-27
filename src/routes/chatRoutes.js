const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Get chat history for a room
router.get('/history/:roomId', chatController.getChatHistory);

// Get all chat rooms for a user
router.get('/rooms', chatController.getChatRooms);

// Create or get chat room between vepari and factory
router.post('/room', chatController.createOrGetChatRoom);

// Clear chat history for a room
router.post('/clear', chatController.clearChatHistory);

module.exports = router;