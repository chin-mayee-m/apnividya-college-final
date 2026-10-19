const express = require('express');
const router = express.Router();
const student = require('../controllers/student');
const rec = require('../controllers/recommendation');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/me/performance', authorize('student'), student.myPerformance);
router.get('/me/recommendations', authorize('student'), (req, res, next) => {
  req.params.id = req.user.id;
  return rec.listForStudent(req, res, next);
});

router.get('/', authorize('admin'), student.list);
router.get('/:id/overview', authorize('admin'), student.overview);
router.get('/:id/history', authorize('admin'), student.history);
router.get('/:id/recommendations', authorize('admin'), rec.listForStudent);
router.post('/:id/recommendations', authorize('admin'), rec.create);

module.exports = router;
