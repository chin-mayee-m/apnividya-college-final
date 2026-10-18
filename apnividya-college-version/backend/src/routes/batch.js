const express = require('express');
const router = express.Router();
const batch = require('../controllers/batch');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, batch.list);
router.post('/', authenticate, authorize('admin'), batch.create);
router.get('/:batch_id/students', authenticate, authorize('admin'), batch.students);

module.exports = router;
