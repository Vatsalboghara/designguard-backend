const db = require('../config/db');

// Vepari: Get All Factories
exports.getFactoryList = async (req, res) => {
    try {
        const vepari_id = req.user.id;
        // Get factories with their profile details and the status of any request from this vepari
        const factories = await db.query(`
            SELECT 
                u.id, 
                u.full_name, 
                fp.company_name, 
                fp.factory_address, 
                fp.logo_url,
                fp.profile_picture_url,
                dar.status as request_status,
                dar.access_expires_at
            FROM users u
            JOIN factory_profiles fp ON u.id = fp.user_id
            LEFT JOIN design_access_requests dar ON dar.factory_id = u.id AND dar.vepari_id = $1
            WHERE u.role = 'factory_owner'
        `, [vepari_id]);

        res.json(factories.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// Vepari: Request Access
exports.requestAccess = async (req, res) => {
    try {
        const { factory_id } = req.body;
        const vepari_id = req.user.id;

        const request = await db.query(
            `INSERT INTO design_access_requests (vepari_id, factory_id, status)
             VALUES ($1, $2, 'pending') 
             ON CONFLICT (vepari_id, factory_id) DO UPDATE SET status = 'pending'
             RETURNING *`,
            [vepari_id, factory_id]
        );
        res.json(request.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// Factory: Get Pending Requests
exports.getPendingRequests = async (req, res) => {
    try {
        const factory_id = req.user.id;
        const requests = await db.query(
            `SELECT 
                r.id,
                r.vepari_id,
                r.status,
                u.full_name as vepari_name, 
                u.email as vepari_email,
                vp.vepari_brand_name as shop_name,
                vp.city,
                vp.profile_picture_url as vepari_profile_image
             FROM design_access_requests r
             JOIN users u ON r.vepari_id = u.id
             LEFT JOIN vepari_profiles vp ON u.id = vp.user_id
             WHERE r.factory_id = $1 AND r.status = 'pending'`,
            [factory_id]
        );
        res.json(requests.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// Factory: Approve/Reject Request
exports.respondToRequest = async (req, res) => {
    try {
        const { status, durationDays } = req.body; // 'approved' or 'rejected'
        const requestId = req.params.id;

        let access_granted_at = null;
        let access_expires_at = null;

        if (status === 'approved') {
            access_granted_at = new Date();
            const days = durationDays ? parseInt(durationDays) : 7; // Default 7 if missing
            access_expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        }

        const updated = await db.query(
            `UPDATE design_access_requests 
             SET status = $1, access_granted_at = $2, access_expires_at = $3
             WHERE id = $4 RETURNING *`,
            [status, access_granted_at, access_expires_at, requestId]
        );
        res.json(updated.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};