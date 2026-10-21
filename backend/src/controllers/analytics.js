ROUND(AVG(a.percentage)::numeric, 1) AS percentage
 const db = require('../config/db');
const a = require('../utils/analytics');

async function examAnalytics(req, res, next) {
  try { res.json(await a.examAnalytics(req.params.exam_id)); } catch (err) { next(err); }
}

async function mentorDashboard(req, res, next) {
  try { res.json(await a.mentorDashboard(req.user.id)); } catch (err) { next(err); }
}

// Leaderboard for one exam, or across every exam a batch has sat. The overall
// view ranks on average percentage so a student who missed an exam is not
// rewarded or punished by the raw sum.
async function leaderboard(req, res, next) {
  try {
    const { exam_id } = req.query;

    if (exam_id && exam_id !== 'overall') {
      const rows = (await db.query(
        `SELECT a.student_id, u.name, u.roll_no, a.score, a.max_marks, a.percentage, a.rank, a.passed
           FROM attempts a JOIN users u ON u.id = a.student_id
          WHERE a.exam_id = ? AND a.status IN ('submitted','evaluated')
          ORDER BY a.score DESC, a.submitted_at ASC`,
        [exam_id]
      )).rows;
      return res.json(rows.map((r, i) => ({ ...r, rank: r.rank || i + 1 })));
    }

    const rows = (await db.query(
      `SELECT u.id AS student_id, u.name, u.roll_no,
              ROUND(AVG(a.percentage)::numeric, 1) AS percentage,
              SUM(a.score) AS score, SUM(a.max_marks) AS max_marks,
              COUNT(*) AS exams_taken
         FROM attempts a JOIN users u ON u.id = a.student_id
        WHERE a.status IN ('submitted','evaluated')
        GROUP BY u.id
        ORDER BY percentage DESC`
    )).rows;

    let lastPct = null; let lastRank = 0;
    res.json(rows.map((r, i) => {
      const rank = r.percentage === lastPct ? lastRank : i + 1;
      lastPct = r.percentage; lastRank = rank;
      return { ...r, rank };
    }));
  } catch (err) { next(err); }
}

async function topics(req, res, next) {
  try {
    res.json(await a.topicPerformance({
      examId: req.query.exam_id || null,
      studentId: req.query.student_id || null,
    }));
  } catch (err) { next(err); }
}

module.exports = { examAnalytics, mentorDashboard, leaderboard, topics };
