const express = require('express');
const router = express.Router();
const analytics = require('../controllers/analytics');
const rec = require('../controllers/recommendation');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/dashboard', authorize('admin'), analytics.mentorDashboard);
router.get('/leaderboard', analytics.leaderboard);
router.get('/topics', analytics.topics);
router.get('/recommendations', authorize('admin'), rec.listAll);
router.delete('/recommendations/:rec_id', authorize('admin'), rec.remove);

module.exports = router;
