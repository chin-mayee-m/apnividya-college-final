const express = require('express');
const router = express.Router();
const q = require('../controllers/question');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// The whole question bank is mentor-only — students never see an answer key.
router.use(authenticate, authorize('admin'));

router.post('/import-document', upload.single('file'), q.importDocument);
router.get('/', q.list);
router.post('/', q.create);
router.post('/bulk', q.bulkCreate);
router.get('/topics', q.topics);
router.get('/sets', q.listSets);
router.post('/sets', q.createSet);
router.get('/sets/:id', q.getSet);
router.put('/:id', q.update);
router.delete('/:id', q.remove);

module.exports = router;
