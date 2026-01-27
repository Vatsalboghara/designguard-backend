const express = require('express');
const router = express.Router();
const accessController = require('../controllers/accessController');

router.get('/factories', accessController.getFactoryList);
router.post('/access/request', accessController.requestAccess);
router.get('/access/pending', accessController.getPendingRequests);
router.put('/access/respond/:id', accessController.respondToRequest);

module.exports = router;