const db = require('../config/db');
const { liveStatus, canStart, generateExamCode } = require('../utils/examWindow');
const { publicExam } = require('../utils/analytics');
const questionCtl = require('./question');

// Creates an exam and attaches its questions in one transaction. Questions can
// arrive three ways, and all three are supported in a single call because the
// wizard lets a mentor mix them: existing bank ids, a saved set, and brand-new
// questions typed into the wizard.
async function create(req, res, next) {
  try {
    const {
      batch_id, title, subject, scheduled_at, duration_min, passing_marks,
      question_type, instructions, shuffle, show_result, negative_marking,
      proctoring, max_violations,
      question_ids = [], set_id = null, new_questions = [], question_marks = {},
    } = req.body;

    if (!batch_id || !title || !subject || !scheduled_at) {
      return res.status(400).json({
        error: 'Batch, title, subject and scheduled date/time are required',
      });
    }
    if (!(await db.query('SELECT 1 FROM batches WHERE id = ?', [batch_id])).rows[0]) {
      return res.status(400).json({ error: 'That batch does not exist' });
    }

    const result = await db.transaction(async () => {
      let ids = [...question_ids].map(Number);

      if (set_id) {
        const fromSet = (await db.query(
          'SELECT question_id FROM question_set_items WHERE set_id = ? ORDER BY position',
          [set_id]
        )).rows.map((r) => r.question_id);
        ids = [...ids, ...fromSet];
      }

      for (const raw of new_questions) {
        const q = questionCtl.normalise({ subject, ...raw });
        const r = await db.query(
          `INSERT INTO questions
             (created_by, subject, topic, type, text, options, correct_index, correct_indices,
              correct_number, tolerance, model_answer, marks, negative_marks, difficulty)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [req.user.id, q.subject, q.topic, q.type, q.text, q.options, q.correct_index,
           q.correct_indices, q.correct_number, q.tolerance, q.model_answer,
           q.marks, q.negative_marks, q.difficulty]
        );
        ids.push(Number(r.lastInsertRowid));
      }

      // De-duplicate while keeping the mentor's ordering.
      ids = [...new Set(ids)];
      if (ids.length === 0) {
        throw Object.assign(new Error('Add at least one question'), { status: 400 });
      }

      const placeholders = ids.map(() => '?').join(',');
      const bank = (await db.query(
        `SELECT id, marks FROM questions WHERE id IN (${placeholders})`, ids
      )).rows;
      if (bank.length !== ids.length) {
        throw Object.assign(new Error('One or more questions no longer exist'), { status: 400 });
      }

      // Per-question marks can be overridden for this exam; the bank value is
      // the fallback. Totals are computed here, never trusted from the client.
      const marksFor = (qid) => Number(question_marks[qid] ?? bank.find((b) => b.id === qid).marks) || 1;
      const totalMarks = ids.reduce((s, qid) => s + marksFor(qid), 0);

      const pass = Number(passing_marks) || Math.ceil(totalMarks * 0.33);
      if (pass > totalMarks) {
        throw Object.assign(new Error('Passing marks cannot exceed total marks'), { status: 400 });
      }

      const r = await db.query(
        `INSERT INTO exams
           (created_by, batch_id, title, subject, scheduled_at, duration_min, total_marks,
            passing_marks, num_questions, question_type, instructions, status,
            shuffle, show_result, negative_marking, proctoring, max_violations)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?)`,
        [req.user.id, batch_id, title, subject, new Date(scheduled_at).toISOString(),
         Number(duration_min) || 60, totalMarks, pass, ids.length,
         question_type || 'mixed', instructions || null,
         shuffle ? 1 : 0, show_result === false ? 0 : 1, negative_marking ? 1 : 0,
         proctoring ? 1 : 0, Math.max(1, Number(max_violations) || 3)]
      );
      const examId = Number(r.lastInsertRowid);

      for (let i = 0; i < ids.length; i += 1) {
        const qid = ids[i];
        await db.query(
          'INSERT INTO exam_questions (exam_id, question_id, position, marks) VALUES (?,?,?,?)',
          [examId, qid, i, marksFor(qid)]
        );
      }

      return examId;
    });

    const exam = (await db.query('SELECT * FROM exams WHERE id = ?', [result])).rows[0];
    res.status(201).json({ ...publicExam(exam), live_status: liveStatus(exam) });
  } catch (err) { next(err); }
}

// Publishing is what mints the exam code — a draft has no code, so a code that
// exists is always joinable.
async function publish(req, res, next) {
  try {
    const exam = (await db.query('SELECT * FROM exams WHERE id = ?', [req.params.id])).rows[0];
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id) {
      return res.status(403).json({ error: 'This is not your exam' });
    }
    if (exam.num_questions === 0) {
      return res.status(400).json({ error: 'Add at least one question before publishing' });
    }

    const code = exam.exam_code || generateExamCode();
    await db.query(
      "UPDATE exams SET status = 'published', exam_code = ?, updated_at = datetime('now') WHERE id = ?",
      [code, exam.id]
    );

    const updated = (await db.query('SELECT * FROM exams WHERE id = ?', [exam.id])).rows[0];
    res.json({
      ...publicExam(updated),
      live_status: liveStatus(updated),
      join_url: `${req.protocol}://${req.get('host')}/?code=${code}`,
    });
  } catch (err) { next(err); }
}

// Mentor's exam list, with the counters the Tests tab shows on each card.
async function list(req, res, next) {
  try {
    const rows = (await db.query(
      `SELECT e.*, b.name AS batch_name,
              (SELECT COUNT(*) FROM enrollments en WHERE en.batch_id = e.batch_id) AS capacity,
              (SELECT COUNT(*) FROM attempts a
                WHERE a.exam_id = e.id AND a.status IN ('submitted','evaluated')) AS appeared,
              (SELECT COUNT(*) FROM attempt_answers aa
                 JOIN attempts a2 ON a2.id = aa.attempt_id
                WHERE a2.exam_id = e.id AND aa.needs_grading = 1) AS pending_grading
         FROM exams e JOIN batches b ON b.id = e.batch_id
        WHERE e.created_by = ?
        ORDER BY e.scheduled_at DESC`,
      [req.user.id]
    )).rows;

    const now = new Date();
    let out = rows.map((e) => ({
      ...publicExam(e),
      batch_name: e.batch_name,
      capacity: e.capacity,
      appeared: e.appeared,
      pending_grading: e.pending_grading,
      live_status: liveStatus(e, now),
    }));

    if (req.query.status) {
      out = out.filter((e) => e.live_status.toLowerCase() === String(req.query.status).toLowerCase());
    }
    res.json(out);
  } catch (err) { next(err); }
}

// Full exam detail including the answer key — mentor only.
async function get(req, res, next) {
  try {
    const exam = (await db.query(
      `SELECT e.*, b.name AS batch_name FROM exams e
         JOIN batches b ON b.id = e.batch_id WHERE e.id = ?`,
      [req.params.id]
    )).rows[0];
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const questions = (await db.query(
      `SELECT q.*, eq.position, eq.marks AS exam_marks, eq.id AS exam_question_id
         FROM exam_questions eq JOIN questions q ON q.id = eq.question_id
        WHERE eq.exam_id = ? ORDER BY eq.position`,
      [req.params.id]
    )).rows.map(questionCtl.hydrate);

    res.json({
      ...publicExam(exam),
      batch_name: exam.batch_name,
      live_status: liveStatus(exam),
      questions,
    });
  } catch (err) { next(err); }
}

// Reorder questions or change per-question marks. Totals are recomputed so the
// exam's total_marks can never drift out of step with its questions.
async function updateQuestions(req, res, next) {
  try {
    const exam = (await db.query('SELECT * FROM exams WHERE id = ?', [req.params.id])).rows[0];
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id) return res.status(403).json({ error: 'This is not your exam' });

    const attempted = (await db.query('SELECT 1 FROM attempts WHERE exam_id = ?', [exam.id])).rows[0];
    if (attempted) {
      return res.status(409).json({
        error: 'Students have already started this exam — its questions are locked',
      });
    }

    const items = Array.isArray(req.body.questions) ? req.body.questions : [];
    if (!items.length) return res.status(400).json({ error: 'Send the ordered question list' });

    await db.transaction(async () => {
      await db.query('DELETE FROM exam_questions WHERE exam_id = ?', [exam.id]);
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const qid = Number(item.question_id ?? item.id);
        const bank = (await db.query('SELECT marks FROM questions WHERE id = ?', [qid])).rows[0];
        if (!bank) throw Object.assign(new Error(`Question ${qid} not found`), { status: 400 });
        await db.query(
          'INSERT INTO exam_questions (exam_id, question_id, position, marks) VALUES (?,?,?,?)',
          [exam.id, qid, i, Number(item.marks) || bank.marks]
        );
      }
      const total = (await db.query(
        'SELECT COALESCE(SUM(marks),0) AS t FROM exam_questions WHERE exam_id = ?', [exam.id]
      )).rows[0].t;
      await db.query(
        "UPDATE exams SET total_marks = ?, num_questions = ?, updated_at = datetime('now') WHERE id = ?",
        [total, items.length, exam.id]
      );
    });

    res.json({ updated: true });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const exam = (await db.query('SELECT * FROM exams WHERE id = ?', [req.params.id])).rows[0];
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.created_by !== req.user.id) return res.status(403).json({ error: 'This is not your exam' });
    const attempted = (await db.query('SELECT 1 FROM attempts WHERE exam_id = ?', [exam.id])).rows[0];
    if (attempted) {
      return res.status(409).json({ error: 'Students have attempted this exam — it cannot be deleted' });
    }
    await db.query('DELETE FROM exams WHERE id = ?', [exam.id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
}

// ---- Student side ---------------------------------------------------------

// Join screen: the pre-exam briefing. Deliberately returns no questions — only
// what the student needs to decide to press Start.
async function byCode(req, res, next) {
  try {
    const code = String(req.params.code || '').toUpperCase();
    const exam = (await db.query(
      `SELECT e.*, b.name AS batch_name, u.name AS mentor_name
         FROM exams e JOIN batches b ON b.id = e.batch_id
         JOIN users u ON u.id = e.created_by
        WHERE e.exam_code = ?`,
      [code]
    )).rows[0];
    if (!exam) return res.status(404).json({ error: 'No exam found with that code' });

    const enrolled = (await db.query(
      'SELECT 1 FROM enrollments WHERE batch_id = ? AND student_id = ?',
      [exam.batch_id, req.user.id]
    )).rows[0];
    if (!enrolled) {
      return res.status(403).json({ error: 'This exam is set for a batch you are not enrolled in' });
    }

    const existing = (await db.query(
      'SELECT id, status FROM attempts WHERE exam_id = ? AND student_id = ?',
      [exam.id, req.user.id]
    )).rows[0];

    const gate = canStart(exam);
    res.json({
      ...publicExam(exam),
      batch_name: exam.batch_name,
      mentor_name: exam.mentor_name,
      live_status: liveStatus(exam),
      can_start: gate.ok && (!existing || existing.status === 'in_progress'),
      blocked_reason: gate.ok ? null : gate.reason,
      existing_attempt: existing || null,
    });
  } catch (err) { next(err); }
}

// Every exam set for a batch the student belongs to, with their own attempt
// state folded in so the Exams tab can render the right action per card.
async function listForStudent(req, res, next) {
  try {
    const rows = (await db.query(
      `SELECT e.*, b.name AS batch_name,
              a.id AS attempt_id, a.status AS attempt_status, a.score, a.percentage, a.rank
         FROM exams e
         JOIN batches b ON b.id = e.batch_id
         JOIN enrollments en ON en.batch_id = e.batch_id AND en.student_id = ?
         LEFT JOIN attempts a ON a.exam_id = e.id AND a.student_id = ?
        WHERE e.status = 'published'
        ORDER BY e.scheduled_at DESC`,
      [req.user.id, req.user.id]
    )).rows;

    const now = new Date();
    let out = rows.map((e) => ({
      ...publicExam(e),
      batch_name: e.batch_name,
      live_status: liveStatus(e, now),
      attempt: e.attempt_id
        ? {
            id: e.attempt_id, status: e.attempt_status,
            score: e.score, percentage: e.percentage, rank: e.rank,
          }
        : null,
    }));

    if (req.query.status) {
      out = out.filter((e) => e.live_status.toLowerCase() === String(req.query.status).toLowerCase());
    }
    res.json(out);
  } catch (err) { next(err); }
}

module.exports = {
  create, publish, list, get, updateQuestions, remove, byCode, listForStudent,
};
