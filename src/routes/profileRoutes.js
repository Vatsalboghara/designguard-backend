const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authMiddleware = require('../middleware/authMiddleware');

const upload = require('../middleware/uploadMiddleware');

// Profile routes
router.get('/profile', authMiddleware, profileController.getProfile);
router.put('/profile', authMiddleware, profileController.updateProfile);
router.post('/profile/picture', authMiddleware, upload.single('profile_picture'), profileController.uploadProfilePicture);
router.get('/profile/:userId', authMiddleware, profileController.getPublicProfile);

module.exports = router;