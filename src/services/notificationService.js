const db = require('../config/db');
const { getIO } = require('../config/socket');

class NotificationService {
    // Create a new notification
    static async createNotification(userId, type, title, message, data = null) {
        try {
            const result = await db.query(`
                INSERT INTO notifications (user_id, type, title, message, data)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [userId, type, title, message, data ? JSON.stringify(data) : null]);

            const notification = result.rows[0];
            
            // Send real-time notification via Socket.io
            try {
                const io = getIO();
                io.to(`user_${userId}`).emit('new_notification', {
                    id: notification.id,
                    type: notification.type,
                    title: notification.title,
                    message: notification.message,
                    data: notification.data,
                    createdAt: notification.created_at,
                    isRead: notification.is_read
                });
                console.log(`📢 Real-time notification sent to user ${userId}`);
            } catch (socketError) {
                console.log('Socket.io not available or user not connected:', socketError.message);
            }

            return notification;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }

    // Create order notification for factory owner
    static async notifyNewOrder(factoryId, order) {
        const title = `New Order #${order.id}`;
        const message = `You have received a new order from ${order.vepari_email} for ${order.quantity} units of Design ${order.design_number || order.design_id}.`;
        
        return await this.createNotification(
            factoryId,
            'new_order',
            title,
            message,
            {
                orderId: order.id,
                vepariEmail: order.vepari_email,
                designId: order.design_id,
                quantity: order.quantity
            }
        );
    }

    // Create order status update notification for vepari
    static async notifyOrderStatusUpdate(vepariId, order, newStatus) {
        const statusMessages = {
            'confirmed': 'Your order has been confirmed and is being prepared.',
            'in_progress': 'Your order is now in progress.',
            'completed': 'Your order has been completed!',
            'cancelled': 'Your order has been cancelled.'
        };

        const title = `Order #${order.id} ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`;
        const message = statusMessages[newStatus] || `Your order status has been updated to ${newStatus}.`;
        
        return await this.createNotification(
            vepariId,
            'order_status_update',
            title,
            message,
            {
                orderId: order.id,
                factoryEmail: order.factory_email,
                designId: order.design_id,
                status: newStatus
            }
        );
    }

    // Get notifications for a user
    static async getUserNotifications(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        
        const result = await db.query(`
            SELECT * FROM notifications 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3
        `, [userId, limit, offset]);

        const countResult = await db.query(
            'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
            [userId]
        );

        return {
            notifications: result.rows,
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
        };
    }

    // Mark notification as read
    static async markAsRead(notificationId, userId) {
        const result = await db.query(`
            UPDATE notifications 
            SET is_read = true 
            WHERE id = $1 AND user_id = $2 
            RETURNING *
        `, [notificationId, userId]);

        return result.rows[0];
    }

    // Mark all notifications as read for a user
    static async markAllAsRead(userId) {
        await db.query(`
            UPDATE notifications 
            SET is_read = true 
            WHERE user_id = $1 AND is_read = false
        `, [userId]);
    }

    // Get unread notification count
    static async getUnreadCount(userId) {
        const result = await db.query(`
            SELECT COUNT(*) FROM notifications 
            WHERE user_id = $1 AND is_read = false
        `, [userId]);

        return parseInt(result.rows[0].count);
    }
}

module.exports = NotificationService;