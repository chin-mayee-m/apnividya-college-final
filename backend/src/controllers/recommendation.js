const db = require('../config/db');
const { hydrateRecommendation } = require('../utils/analytics');

async function create(req, res, next) {
  try {
    const { feedback, strengths, improve, recommendation, exam_id } = req.body;
    const studentId = req.params.id;

    if (!String(feedback || '').trim() && !String(recommendation || '').trim()) {
      return res.status(400).json({ error: 'Write some feedback or a recommendation before saving' });
    }
    const student = (await db.query(
      "SELECT 1 FROM users WHERE id = ? AND role = 'student'", [studentId]
    )).rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const r = await db.query(
      `INSERT INTO recommendations
         (student_id, mentor_id, exam_id, feedback, strengths, improve, recommendation)
       VALUES (?,?,?,?,?,?,?)`,
      [studentId, req.user.id, exam_id || null, feedback || null,
       JSON.stringify(Array.isArray(strengths) ? strengths : []),
       JSON.stringify(Array.isArray(improve) ? improve : []),
       recommendation || null]
    );

    const row = (await db.query(
      `SELECT r.*, u.name AS mentor_name FROM recommendations r
         JOIN users u ON u.id = r.mentor_id WHERE r.id = ?`,
      [r.lastInsertRowid]
    )).rows[0];
    res.status(201).json(hydrateRecommendation(row));
  } catch (err) { next(err); }
}

async function listForStudent(req, res, next) {
  try {
    const rows = (await db.query(
      `SELECT r.*, u.name AS mentor_name, e.title AS exam_title
         FROM recommendations r
         JOIN users u ON u.id = r.mentor_id
         LEFT JOIN exams e ON e.id = r.exam_id
        WHERE r.student_id = ? ORDER BY r.created_at DESC`,
      [req.params.id]
    )).rows;
    res.json(rows.map(hydrateRecommendation));
  } catch (err) { next(err); }
}

// Every recommendation this mentor has written, newest first.
async function listAll(req, res, next) {
  try {
    const rows = (await db.query(
      `SELECT r.*, u.name AS mentor_name, s.name AS student_name, s.roll_no,
              e.title AS exam_title
         FROM recommendations r
         JOIN users u ON u.id = r.mentor_id
         JOIN users s ON s.id = r.student_id
         LEFT JOIN exams e ON e.id = r.exam_id
        WHERE r.mentor_id = ? ORDER BY r.created_at DESC LIMIT 200`,
      [req.user.id]
    )).rows;
    res.json(rows.map(hydrateRecommendation));
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const row = (await db.query('SELECT * FROM recommendations WHERE id = ?', [req.params.rec_id])).rows[0];
    if (!row) return res.status(404).json({ error: 'Recommendation not found' });
    if (row.mentor_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only remove your own recommendations' });
    }
    await db.query('DELETE FROM recommendations WHERE id = ?', [req.params.rec_id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
}

module.exports = { create, listForStudent, listAll, remove };
