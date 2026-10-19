const express = require('express');
const router = express.Router();
const exam = require('../controllers/exam');
const attempt = require('../controllers/attempt');
const analytics = require('../controllers/analytics');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// Student routes are declared before '/:id' so 'mine' and 'code' are not
// swallowed by the id parameter.
router.get('/mine', authorize('student'), exam.listForStudent);
router.get('/code/:code', authorize('student'), exam.byCode);
router.post('/:exam_id/start', authorize('student'), attempt.start);

router.post('/', authorize('admin'), exam.create);
router.get('/', authorize('admin'), exam.list);
router.get('/:id', authorize('admin'), exam.get);
router.post('/:id/publish', authorize('admin'), exam.publish);
router.put('/:id/questions', authorize('admin'), exam.updateQuestions);
router.delete('/:id', authorize('admin'), exam.remove);

router.get('/:exam_id/analytics', authorize('admin'), analytics.examAnalytics);
router.get('/:exam_id/pending-grading', authorize('admin'), attempt.pendingGrading);
router.get('/:exam_id/violations', authorize('admin'), attempt.violationReport);

module.exports = router;
