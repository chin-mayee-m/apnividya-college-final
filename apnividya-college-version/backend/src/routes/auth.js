const express = require('express');
const router = express.Router();
const auth = require('../controllers/auth');
const { authenticate } = require('../middleware/auth');

router.post('/login', auth.login);
router.post('/signup', auth.signup);
router.get('/me', authenticate, auth.me);

module.exports = router;
