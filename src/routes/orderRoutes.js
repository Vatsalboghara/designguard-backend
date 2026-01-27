const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware');

// Place a new order
router.post('/orders', authMiddleware, orderController.placeOrder);

// Get orders for a user (with pagination and filtering)
router.get('/orders', authMiddleware, orderController.getOrders);

// Get order details by ID
router.get('/orders/:id', authMiddleware, orderController.getOrderById);

// Update order status (factory only)
router.put('/orders/:id/status', authMiddleware, orderController.updateOrderStatus);

module.exports = router;