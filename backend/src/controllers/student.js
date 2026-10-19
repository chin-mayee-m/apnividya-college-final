const db = require('../config/db');
const a = require('../utils/analytics');

async function list(req, res, next) {
  try {
    const filters = ["u.role = 'student'"];
    const params = [];
    if (req.query.batch_id) {
      filters.push('e.batch_id = ?');
      params.push(req.query.batch_id);
    }
    if (req.query.q) {
      filters.push('(u.name LIKE ? OR u.roll_no LIKE ?)');
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }

    const rows = (await db.query(
      `SELECT DISTINCT u.id, u.name, u.roll_no, u.email,
              (SELECT ROUND(AVG(at.percentage),1) FROM attempts at
                WHERE at.student_id = u.id AND at.status IN ('submitted','evaluated')) AS average_pct,
              (SELECT COUNT(*) FROM attempts at
                WHERE at.student_id = u.id AND at.status IN ('submitted','evaluated')) AS exams_taken
         FROM users u
         LEFT JOIN enrollments e ON e.student_id = u.id
        WHERE ${filters.join(' AND ')}
        ORDER BY average_pct DESC NULLS LAST, u.name`,
      params
    )).rows;

    res.json(rows.map((r) => ({ ...r, average_pct: r.average_pct || 0 })));
  } catch (err) { next(err); }
}

// Journey step 7 — everything the mentor needs on one student in one payload.
async function overview(req, res, next) {
  try { res.json(await a.studentOverview(req.params.id)); } catch (err) { next(err); }
}

async function history(req, res, next) {
  try { res.json(await a.studentHistory(req.params.id)); } catch (err) { next(err); }
}

// The student's own view of the same history, plus their standing in the class.
async function myPerformance(req, res, next) {
  try {
    const history = await a.studentHistory(req.user.id);
    const topics = await a.topicPerformance({ studentId: req.user.id });

    const overall = (await db.query(
      `SELECT student_id, ROUND(AVG(percentage),1) AS avg_pct FROM attempts
        WHERE status IN ('submitted','evaluated') GROUP BY student_id
        ORDER BY avg_pct DESC`
    )).rows;
    const rank = overall.findIndex((r) => r.student_id === req.user.id) + 1;

    res.json({
      history,
      topics,
      strong_topics: topics.filter((t) => t.band === 'strong'),
      weak_topics: topics.filter((t) => t.band === 'weak'),
      improvement_plan: await a.improvementPlan(topics),
      class_rank: rank || null,
      class_size: overall.length,
      recommendations: (await db.query(
        `SELECT r.*, u.name AS mentor_name FROM recommendations r
           JOIN users u ON u.id = r.mentor_id
          WHERE r.student_id = ? ORDER BY r.created_at DESC`,
        [req.user.id]
      )).rows.map(a.hydrateRecommendation),
    });
  } catch (err) { next(err); }
}

module.exports = { list, overview, history, myPerformance };
