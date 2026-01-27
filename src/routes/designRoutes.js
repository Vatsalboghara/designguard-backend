const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const designController = require('../controllers/designController');
const db = require('../config/db');

// Test endpoint
router.get('/test', (req, res) => {
    res.json({
        message: 'Design routes working',
        user: req.user,
        timestamp: new Date().toISOString()
    });
});

// Debug endpoint to check database schema
router.get('/debug/schema', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT column_name, data_type, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'designs' 
            ORDER BY ordinal_position
        `);
        res.json({
            message: 'Database schema for designs table',
            columns: result.rows
        });
    } catch (err) {
        console.error('Schema check error:', err);
        res.status(500).json({ msg: 'Error checking schema', error: err.message });
    }
});

// Debug endpoint to test design retrieval
router.get('/debug/design/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const design = await db.query("SELECT * FROM designs WHERE id = $1", [id]);
        res.json({
            message: 'Design retrieval test',
            design: design.rows[0] || null,
            found: design.rows.length > 0
        });
    } catch (err) {
        console.error('Design retrieval error:', err);
        res.status(500).json({ msg: 'Error retrieving design', error: err.message });
    }
});

// --- DESIGN ROUTES ---
router.post('/designs', authMiddleware, upload.single('image'), designController.addDesign);
router.get('/designs/:factory_id', authMiddleware, designController.getDesigns);
router.put('/designs/:id', authMiddleware, upload.single('image'), designController.updateDesign);
router.delete('/designs/:id', authMiddleware, designController.deleteDesign);

module.exports = router;
