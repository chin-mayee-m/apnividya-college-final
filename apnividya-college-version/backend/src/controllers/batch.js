const db = require('../config/db');

async function list(req, res, next) {
  try {
    const rows = (await db.query(
      `SELECT b.*, (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) AS student_count
         FROM batches b ORDER BY b.name`
    )).rows;
    res.json(rows);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Batch name is required' });
    const r = await db.query('INSERT INTO batches (name, created_by) VALUES (?, ?)', [name, req.user.id]);
    res.status(201).json((await db.query('SELECT * FROM batches WHERE id = ?', [r.lastInsertRowid])).rows[0]);
  } catch (err) { next(err); }
}

async function students(req, res, next) {
  try {
    const rows = (await db.query(
      `SELECT u.id, u.name, u.roll_no, u.email
         FROM users u JOIN enrollments e ON e.student_id = u.id
        WHERE e.batch_id = ? ORDER BY u.roll_no`,
      [req.params.batch_id]
    )).rows;
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { list, create, students };
