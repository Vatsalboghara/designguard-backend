const db = require('../config/db');
const NotificationService = require('../services/notificationService');

// Place a new order
exports.placeOrder = async (req, res) => {
    try {
        const { designId, factoryId, quantity, printingNote } = req.body;
        const vepariId = req.user.id;

        console.log('Place Order Request:', {
            designId,
            factoryId,
            quantity,
            printingNote,
            vepariId,
            userRole: req.user.role
        });

        // Validate user is a vepari
        if (req.user.role !== 'vepari') {
            console.log('Access denied: User is not a vepari');
            return res.status(403).json({ msg: "Only veparis can place orders" });
        }

        // Validate required fields
        if (!designId || !factoryId || !quantity) {
            console.log('Validation Error: Missing required fields');
            return res.status(400).json({ msg: "Design ID, Factory ID, and Quantity are required" });
        }

        if (quantity <= 0 || quantity > 10000) {
            console.log('Validation Error: Invalid quantity');
            return res.status(400).json({ msg: "Quantity must be between 1 and 10000" });
        }

        // Verify design exists and belongs to the factory
        const designCheck = await db.query(`
            SELECT d.*, u.email as factory_email 
            FROM designs d
            JOIN users u ON d.factory_id = u.id
            WHERE d.id = $1 AND d.factory_id = $2 AND u.role = 'factory_owner'
        `, [designId, factoryId]);

        if (designCheck.rows.length === 0) {
            console.log('Validation Error: Design not found or does not belong to factory');
            return res.status(404).json({ msg: "Design not found or does not belong to the specified factory" });
        }

        // Check if vepari has approved access to this factory's designs
        const accessCheck = await db.query(`
            SELECT * FROM design_access_requests 
            WHERE vepari_id = $1 AND factory_id = $2 AND status = 'approved'
            AND (access_expires_at IS NULL OR access_expires_at > NOW())
        `, [vepariId, factoryId]);

        if (accessCheck.rows.length === 0) {
            console.log('Access denied: Vepari does not have approved access to this factory');
            return res.status(403).json({ 
                msg: "You need approved access to place orders with this factory. Please request access first." 
            });
        }

        // Create the order
        const orderResult = await db.query(`
            INSERT INTO orders (vepari_id, factory_id, design_id, quantity, printing_note, status)
            VALUES ($1, $2, $3, $4, $5, 'pending')
            RETURNING *
        `, [vepariId, factoryId, designId, quantity, printingNote?.trim() || null]);

        const order = orderResult.rows[0];

        // Get complete order details with design and user info
        const completeOrder = await db.query(`
            SELECT 
                o.*,
                d.design_number,
                d.image_url as design_image,
                d.color_variants,
                v.email as vepari_email,
                f.email as factory_email
            FROM orders o
            JOIN designs d ON o.design_id = d.id
            JOIN users v ON o.vepari_id = v.id
            JOIN users f ON o.factory_id = f.id
            WHERE o.id = $1
        `, [order.id]);

        console.log('Order placed successfully:', completeOrder.rows[0]);

        // Send notification to factory owner
        try {
            await NotificationService.notifyNewOrder(factoryId, completeOrder.rows[0]);
            console.log('✅ Notification sent to factory owner');
        } catch (notificationError) {
            console.error('Failed to send notification:', notificationError);
            // Don't fail the order if notification fails
        }

        res.status(201).json({
            msg: "Order placed successfully",
            order: completeOrder.rows[0]
        });

    } catch (err) {
        console.error('Place Order Error:', err);
        res.status(500).json({ 
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Get orders for a user (vepari or factory)
exports.getOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        console.log('Get Orders Request:', { userId, userRole, status, page, limit });

        let query;
        let queryParams = [userId];
        let countQuery;
        let countParams = [userId];

        if (userRole === 'vepari') {
            query = `
                SELECT 
                    o.*,
                    d.design_number,
                    d.image_url as design_image,
                    d.color_variants,
                    f.email as factory_email
                FROM orders o
                JOIN designs d ON o.design_id = d.id
                JOIN users f ON o.factory_id = f.id
                WHERE o.vepari_id = $1
            `;
            countQuery = 'SELECT COUNT(*) FROM orders WHERE vepari_id = $1';
        } else if (userRole === 'factory_owner') {
            query = `
                SELECT 
                    o.*,
                    d.design_number,
                    d.image_url as design_image,
                    d.color_variants,
                    v.email as vepari_email
                FROM orders o
                JOIN designs d ON o.design_id = d.id
                JOIN users v ON o.vepari_id = v.id
                WHERE o.factory_id = $1
            `;
            countQuery = 'SELECT COUNT(*) FROM orders WHERE factory_id = $1';
        } else {
            return res.status(403).json({ msg: "Invalid user role for order access" });
        }

        // Add status filter if provided
        if (status) {
            query += ' AND o.status = $' + (queryParams.length + 1);
            countQuery += ' AND status = $' + (countParams.length + 1);
            queryParams.push(status);
            countParams.push(status);
        }

        // Add ordering and pagination
        query += ' ORDER BY o.order_date DESC LIMIT $' + (queryParams.length + 1) + ' OFFSET $' + (queryParams.length + 2);
        queryParams.push(limit, offset);

        const [ordersResult, countResult] = await Promise.all([
            db.query(query, queryParams),
            db.query(countQuery, countParams)
        ]);

        const totalOrders = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalOrders / limit);

        console.log(`Found ${ordersResult.rows.length} orders for user ${userId}`);

        res.json({
            orders: ordersResult.rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalOrders,
                hasMore: page < totalPages
            }
        });

    } catch (err) {
        console.error('Get Orders Error:', err);
        res.status(500).json({ 
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Update order status (factory only)
exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const factoryId = req.user.id;

        console.log('Update Order Status Request:', { id, status, factoryId, userRole: req.user.role });

        // Validate user is a factory owner
        if (req.user.role !== 'factory_owner') {
            console.log('Access denied: User is not a factory owner');
            return res.status(403).json({ msg: "Only factory owners can update order status" });
        }

        // Validate status
        const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            console.log('Validation Error: Invalid status');
            return res.status(400).json({ 
                msg: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
            });
        }

        // Verify order exists and belongs to this factory
        const orderCheck = await db.query(`
            SELECT * FROM orders WHERE id = $1 AND factory_id = $2
        `, [id, factoryId]);

        if (orderCheck.rows.length === 0) {
            console.log('Order not found or access denied');
            return res.status(404).json({ msg: "Order not found or access denied" });
        }

        // Update order status
        const updateResult = await db.query(`
            UPDATE orders 
            SET status = $1, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2 
            RETURNING *
        `, [status, id]);

        // Get complete order details
        const completeOrder = await db.query(`
            SELECT 
                o.*,
                d.design_number,
                d.image_url as design_image,
                d.color_variants,
                v.email as vepari_email
            FROM orders o
            JOIN designs d ON o.design_id = d.id
            JOIN users v ON o.vepari_id = v.id
            WHERE o.id = $1
        `, [id]);

        console.log('Order status updated successfully:', completeOrder.rows[0]);

        // Send notification to vepari about status update
        try {
            await NotificationService.notifyOrderStatusUpdate(
                completeOrder.rows[0].vepari_id, 
                completeOrder.rows[0], 
                status
            );
            console.log('✅ Status update notification sent to vepari');
        } catch (notificationError) {
            console.error('Failed to send status update notification:', notificationError);
            // Don't fail the update if notification fails
        }

        res.json({
            msg: "Order status updated successfully",
            order: completeOrder.rows[0]
        });

    } catch (err) {
        console.error('Update Order Status Error:', err);
        res.status(500).json({ 
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Get order details by ID
exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        console.log('Get Order By ID Request:', { id, userId, userRole: req.user.role });

        // Get order with complete details
        const orderResult = await db.query(`
            SELECT 
                o.*,
                d.design_number,
                d.image_url as design_image,
                d.color_variants,
                v.email as vepari_email,
                f.email as factory_email
            FROM orders o
            JOIN designs d ON o.design_id = d.id
            JOIN users v ON o.vepari_id = v.id
            JOIN users f ON o.factory_id = f.id
            WHERE o.id = $1
        `, [id]);

        if (orderResult.rows.length === 0) {
            console.log('Order not found');
            return res.status(404).json({ msg: "Order not found" });
        }

        const order = orderResult.rows[0];

        // Verify user has access to this order
        if (order.vepari_id !== userId && order.factory_id !== userId) {
            console.log('Access denied: User not part of this order');
            return res.status(403).json({ msg: "Access denied" });
        }

        console.log('Order details retrieved:', order);

        res.json(order);

    } catch (err) {
        console.error('Get Order By ID Error:', err);
        res.status(500).json({ 
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};