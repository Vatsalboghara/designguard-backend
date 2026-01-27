const db = require('../config/db');
const cloudinary = require('../config/cloudinary');
const { Stream } = require('stream');

// Helper to upload buffer to Cloudinary
const uploadToCloudinary = (buffer) => {
    return new Promise((resolve, reject) => {
        // Timeout after 15 seconds
        const timeout = setTimeout(() => {
            reject(new Error("Cloudinary upload timed out (15s)"));
        }, 15000);

        const stream = cloudinary.uploader.upload_stream(
            { folder: "designguard_designs" },
            (error, result) => {
                clearTimeout(timeout);
                if (error) return reject(error);
                if (result) return resolve(result);
                reject(new Error("Unknown error during upload"));
            }
        );
        const bufferStream = new Stream.PassThrough();
        bufferStream.end(buffer);
        bufferStream.pipe(stream);
    });
};

exports.addDesign = async (req, res) => {
    try {

        const { design_number, color_variants } = req.body;
        const user_id = req.user.id;

        // Validate user is a factory owner
        const userCheck = await db.query(
            "SELECT role FROM users WHERE id = $1",
            [user_id]
        );

        if (userCheck.rows.length === 0 || userCheck.rows[0].role !== 'factory_owner') {
            return res.status(403).json({ msg: "Only factory owners can upload designs" });
        }

        // Validate required fields
        if (!design_number || design_number.trim() === '') {
            return res.status(400).json({ msg: "Design number is required" });
        }

        if (!req.file) {
            return res.status(400).json({ msg: "No image uploaded" });
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/pjpeg', 'application/octet-stream'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ msg: "Only JPEG, PNG, and WebP images are allowed" });
        }

        // Check for duplicate design number for this factory
        const existingDesign = await db.query(
            "SELECT id FROM designs WHERE factory_id = $1 AND design_number = $2",
            [user_id, design_number.trim()]
        );

        if (existingDesign.rows.length > 0) {
            return res.status(400).json({ msg: "Design number already exists for this factory" });
        }

        const result = await uploadToCloudinary(req.file.buffer);

        const newDesign = await db.query(
            `INSERT INTO designs (factory_id, design_number, image_url, color_variants)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [user_id, design_number.trim(), result.secure_url, color_variants?.trim() || null]
        );

        res.status(201).json(newDesign.rows[0]);
    } catch (err) {
        console.error('Add Design Error:', err);

        // Handle specific database errors
        if (err.code === '23505') { // PostgreSQL unique constraint violation
            return res.status(400).json({ msg: "Design number already exists for this factory" });
        }

        res.status(500).json({ msg: "Server Error", error: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }
};

exports.getDesigns = async (req, res) => {
    try {
        const { factory_id } = req.params;
        const viewer_id = req.user.id;
        
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Validate pagination parameters
        if (page < 1 || limit < 1 || limit > 50) {
            return res.status(400).json({ 
                msg: "Invalid pagination parameters. Page must be >= 1, limit must be 1-50" 
            });
        }

        let designs, totalCount;

        // 1. If factory viewing their own designs
        if (parseInt(factory_id) === viewer_id) {
            // Get total count for pagination
            const countResult = await db.query(
                "SELECT COUNT(*) FROM designs WHERE factory_id = $1", 
                [factory_id]
            );
            totalCount = parseInt(countResult.rows[0].count);

            // Get paginated designs
            designs = await db.query(
                `SELECT * FROM designs 
                 WHERE factory_id = $1 
                 ORDER BY created_at DESC 
                 LIMIT $2 OFFSET $3`, 
                [factory_id, limit, offset]
            );
        } else {
            // 2. If Vepari, Check Access
            const access = await db.query(
                `SELECT * FROM design_access_requests 
                 WHERE vepari_id = $1 AND factory_id = $2 
                 AND status = 'approved' AND (access_expires_at IS NULL OR access_expires_at > NOW())`,
                [viewer_id, factory_id]
            );

            if (access.rows.length === 0) {
                // Auto-approve access for development
                await db.query(
                    `INSERT INTO design_access_requests (vepari_id, factory_id, status, access_granted_at, access_expires_at)
                     VALUES ($1, $2, 'approved', NOW(), NOW() + INTERVAL '30 days')
                     ON CONFLICT (vepari_id, factory_id) 
                     DO UPDATE SET status = 'approved', access_granted_at = NOW(), access_expires_at = NOW() + INTERVAL '30 days'`,
                    [viewer_id, factory_id]
                );
            }

            // Get total count for pagination
            const countResult = await db.query(
                "SELECT COUNT(*) FROM designs WHERE factory_id = $1", 
                [factory_id]
            );
            totalCount = parseInt(countResult.rows[0].count);

            // Get paginated designs
            designs = await db.query(
                `SELECT * FROM designs 
                 WHERE factory_id = $1 
                 ORDER BY created_at DESC 
                 LIMIT $2 OFFSET $3`, 
                [factory_id, limit, offset]
            );
        }

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        res.json({
            designs: designs.rows,
            pagination: {
                currentPage: page,
                totalPages,
                totalCount,
                limit,
                hasNextPage,
                hasPrevPage,
                nextPage: hasNextPage ? page + 1 : null,
                prevPage: hasPrevPage ? page - 1 : null
            }
        });

    } catch (err) {
        console.error('Get Designs Error:', err);
        res.status(500).json({ 
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Update Design (Supports Image Replacement)
exports.updateDesign = async (req, res) => {
    try {
        const { id } = req.params;
        const { design_number, color_variants } = req.body;
        const factory_id = req.user.id;

        // Validate design ID is a valid number
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({ msg: "Invalid design ID" });
        }

        if (!req.user || req.user.role !== 'factory_owner') {
            return res.status(403).json({ msg: "Only factory owners can update designs" });
        }

        const design = await db.query("SELECT * FROM designs WHERE id = $1", [parseInt(id)]);
        
        if (design.rows.length === 0) {
            return res.status(404).json({ msg: "Design not found" });
        }

        if (design.rows[0].factory_id !== factory_id) {
            return res.status(401).json({ msg: "Unauthorized" });
        }

        // Validate that at least one field is being updated
        const hasDesignNumber = design_number && design_number.trim() !== '';
        const hasColorVariants = color_variants && color_variants.trim() !== '';
        const hasFile = req.file !== undefined;

        if (!hasDesignNumber && !hasColorVariants && !hasFile) {
            return res.status(400).json({ msg: "At least one field must be updated" });
        }

        // Check for duplicate design number if design_number is being updated
        if (hasDesignNumber && design_number.trim() !== design.rows[0].design_number) {
            const existingDesign = await db.query(
                "SELECT id FROM designs WHERE factory_id = $1 AND design_number = $2 AND id != $3",
                [factory_id, design_number.trim(), parseInt(id)]
            );

            if (existingDesign.rows.length > 0) {
                return res.status(400).json({ msg: "Design number already exists for this factory" });
            }
        }

        let imageUrl = design.rows[0].image_url;

        // If new file is uploaded
        if (hasFile) {
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/pjpeg', 'application/octet-stream'];
            if (!allowedTypes.includes(req.file.mimetype)) {
                return res.status(400).json({ msg: "Only JPEG, PNG, and WebP images are allowed" });
            }

            try {
                const result = await uploadToCloudinary(req.file.buffer);
                imageUrl = result.secure_url;
            } catch (uploadErr) {
                console.error('Image upload failed during update:', uploadErr);
                
                // Handle specific upload errors
                if (uploadErr.message.includes('timed out')) {
                    return res.status(500).json({ msg: "Image upload timed out. Please try again." });
                }
                return res.status(500).json({ msg: "Image upload failed", error: uploadErr.message });
            }
        }

        // Prepare update values
        const updateDesignNumber = hasDesignNumber ? design_number.trim() : design.rows[0].design_number;
        const updateColorVariants = hasColorVariants ? color_variants.trim() : design.rows[0].color_variants;

        const updatedDesign = await db.query(
            `UPDATE designs SET 
                design_number = $1, 
                color_variants = $2,
                image_url = $3,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $4 RETURNING *`,
            [updateDesignNumber, updateColorVariants, imageUrl, parseInt(id)]
        );

        if (updatedDesign.rows.length === 0) {
            return res.status(500).json({ msg: "Failed to update design" });
        }

        res.json(updatedDesign.rows[0]);

    } catch (err) {
        console.error('❌ Update Design Error:', err);

        // Handle specific database errors
        if (err.code === '23505') { // PostgreSQL unique constraint violation
            return res.status(400).json({ msg: "Design number already exists for this factory" });
        }

        // Handle database connection errors
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
            return res.status(500).json({ msg: "Database connection error" });
        }

        res.status(500).json({ 
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};

// Delete Design
exports.deleteDesign = async (req, res) => {
    try {
        const { id } = req.params;
        const factory_id = req.user.id;

        if (req.user.role !== 'factory_owner') {
            return res.status(403).json({ msg: "Only factory owners can delete designs" });
        }

        const design = await db.query("SELECT * FROM designs WHERE id = $1", [id]);
        if (design.rows.length === 0) {
            return res.status(404).json({ msg: "Design not found" });
        }
        if (design.rows[0].factory_id !== factory_id) {
            return res.status(401).json({ msg: "Unauthorized" });
        }

        await db.query("DELETE FROM designs WHERE id = $1", [id]);
        res.json({ msg: "Design deleted successfully" });
    } catch (err) {
        console.error('Delete Design Error:', err);
        res.status(500).json({ 
            msg: "Server Error", 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};