const NotificationService = require('../services/notificationService');

// Get notifications for the current user
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        console.log('Get Notifications Request:', { userId, page, limit });

        const result = await NotificationService.getUserNotifications(userId, page, limit);

        res.json({
            success: true,
            notifications: result.notifications,
            pagination: {
                currentPage: result.page,
                totalPages: result.totalPages,
                total: result.total
            }
        });

    } catch (err) {
        console.error('Get Notifications Error:', err);
        res.status(500).json({ 
            success: false,
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        console.log('Mark Notification As Read Request:', { id, userId });

        const notification = await NotificationService.markAsRead(id, userId);

        if (!notification) {
            return res.status(404).json({ 
                success: false,
                msg: "Notification not found" 
            });
        }

        res.json({
            success: true,
            msg: "Notification marked as read",
            notification
        });

    } catch (err) {
        console.error('Mark Notification As Read Error:', err);
        res.status(500).json({ 
            success: false,
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;

        console.log('Mark All Notifications As Read Request:', { userId });

        await NotificationService.markAllAsRead(userId);

        res.json({
            success: true,
            msg: "All notifications marked as read"
        });

    } catch (err) {
        console.error('Mark All Notifications As Read Error:', err);
        res.status(500).json({ 
            success: false,
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Get unread notification count
exports.getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id;

        console.log('Get Unread Count Request:', { userId });

        const count = await NotificationService.getUnreadCount(userId);

        res.json({
            success: true,
            unreadCount: count
        });

    } catch (err) {
        console.error('Get Unread Count Error:', err);
        res.status(500).json({ 
            success: false,
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};