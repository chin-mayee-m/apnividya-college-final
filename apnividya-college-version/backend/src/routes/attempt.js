const express = require('express');
const router = express.Router();
const attempt = require('../controllers/attempt');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.patch('/:attempt_id/answer', authorize('student'), attempt.saveAnswer);
router.get('/:attempt_id/status', authorize('student'), attempt.status);
router.post('/:attempt_id/submit', authorize('student'), attempt.submit);
router.post('/:attempt_id/violation', authorize('student'), attempt.recordViolation);
router.get('/:attempt_id/result', attempt.result);
router.post('/grade', authorize('admin'), attempt.grade);

module.exports = router;
