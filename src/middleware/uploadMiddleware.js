const multer = require('multer');

// Store file in memory so we can stream it to Cloudinary
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // Limit 5MB
        files: 1 // Only allow 1 file
    },
    fileFilter: (req, file, cb) => {
        // Check file type
        const allowedTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/pjpeg', // Added for extensive JPG support
            'application/octet-stream' // Added for generic mobile uploads
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            console.log('REJECTED FILE MIME TYPE:', file.mimetype);
            const error = new Error(`Only JPEG, PNG, and WebP images are allowed. Received: ${file.mimetype}`);
            error.code = 'INVALID_FILE_TYPE';
            cb(error, false);
        }
    }
});

module.exports = upload;