const db = require('../config/db');
const { canStart, deadlineFor, liveStatus } = require('../utils/examWindow');
const { evaluateAttempt, finaliseAttempt } = require('../utils/evaluation');
const analytics = require('../utils/analytics');

// Deterministic per-student shuffle. Using the attempt id as the seed means a
// shuffled paper stays in the same order across reloads and reconnects — a
// fresh random order mid-exam would scramble the student's question navigator.
function seededOrder(items, seed) {
  const out = [...items];
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Strips the answer key. Everything the student's browser receives passes
// through here, so a key cannot leak into the exam screen via DevTools.
function forStudent(row) {
  return {
    exam_question_id: row.exam_question_id,
    question_id: row.question_id,
    position: row.position,
    text: row.text,
    type: row.type,
    topic: row.topic,
    options: row.options ? JSON.parse(row.options) : null,
    marks: row.marks,
    negative_marks: row.negative_marks,
    answer: row.answer ? JSON.parse(row.answer) : null,
    marked_for_review: !!row.marked_for_review,
    visited: !!row.visited,
    time_spent_sec: row.time_spent_sec,
  };
}

// Starts a fresh attempt, or resumes one already in progress. Resuming is the
// same call so a dropped connection or a closed tab costs nothing but time.
async function start(req, res, next) {
  try {
    const exam = (await db.query('SELECT * FROM exams WHERE id = ?', [req.params.exam_id])).rows[0];
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const enrolled = (await db.query(
      'SELECT 1 FROM enrollments WHERE batch_id = ? AND student_id = ?',
      [exam.batch_id, req.user.id]
    )).rows[0];
    if (!enrolled) return res.status(403).json({ error: 'You are not enrolled in this batch' });

    let attempt = (await db.query(
      'SELECT * FROM attempts WHERE exam_id = ? AND student_id = ?',
      [exam.id, req.user.id]
    )).rows[0];

    if (attempt && attempt.status !== 'in_progress') {
      return res.status(409).json({
        error: 'You have already submitted this exam',
        attempt_id: attempt.id,
      });
    }

    if (!attempt) {
      const gate = canStart(exam);
      if (!gate.ok) return res.status(403).json({ error: gate.reason });

      const now = new Date();
      const deadline = deadlineFor(exam, now);

      attempt = await db.transaction(async () => {
        const r = await db.query(
          `INSERT INTO attempts (exam_id, student_id, started_at, deadline_at, max_marks)
           VALUES (?,?,?,?,?)`,
          [exam.id, req.user.id, now.toISOString(), deadline.toISOString(), exam.total_marks]
        );
        const attemptId = Number(r.lastInsertRowid);

        // A row per question is written up front so unattempted questions are
        // real records — the analytics never has to infer them from absence.
        const eqs = (await db.query(
          'SELECT id, question_id FROM exam_questions WHERE exam_id = ? ORDER BY position',
          [exam.id]
        )).rows;
        for (const eq of eqs) {
          await db.query(
            'INSERT INTO attempt_answers (attempt_id, exam_question_id, question_id) VALUES (?,?,?)',
            [attemptId, eq.id, eq.question_id]
          );
        }
        return (await db.query('SELECT * FROM attempts WHERE id = ?', [attemptId])).rows[0];
      });
    } else if (new Date() > new Date(attempt.deadline_at)) {
      // The tab was closed and the clock ran out while it was gone. Bank
      // whatever was saved rather than letting it sit in limbo.
      return finishAttempt(attempt.id, true, res, next);
    }

    let questions = (await db.query(
      `SELECT aa.exam_question_id, aa.question_id, aa.answer, aa.marked_for_review,
              aa.visited, aa.time_spent_sec, eq.position, eq.marks,
              q.text, q.type, q.topic, q.options, q.negative_marks
         FROM attempt_answers aa
         JOIN exam_questions eq ON eq.id = aa.exam_question_id
         JOIN questions q       ON q.id = aa.question_id
        WHERE aa.attempt_id = ?
        ORDER BY eq.position`,
      [attempt.id]
    )).rows.map(forStudent);

    if (exam.shuffle) questions = seededOrder(questions, attempt.id);

    res.json({
      attempt: {
        id: attempt.id,
        exam_id: exam.id,
        started_at: attempt.started_at,
        deadline_at: attempt.deadline_at,
        server_time: new Date().toISOString(),
        seconds_remaining: Math.max(
          0,
          Math.floor((new Date(attempt.deadline_at) - new Date()) / 1000)
        ),
      },
      exam: {
        ...analytics.publicExam(exam),
        live_status: liveStatus(exam),
      },
      questions,
    });
  } catch (err) { next(err); }
}

// Autosave. Called on every answer change, review toggle and question move —
// small, idempotent, and safe to fire repeatedly.
async function saveAnswer(req, res, next) {
  try {
    const attempt = (await db.query('SELECT * FROM attempts WHERE id = ?', [req.params.attempt_id])).rows[0];
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.student_id !== req.user.id) return res.status(403).json({ error: 'This is not your attempt' });
    if (attempt.status !== 'in_progress') {
      return res.status(409).json({ error: 'This attempt has already been submitted' });
    }

    // The server owns the clock. A late save is refused and the attempt is
    // closed out, so a tampered client timer cannot buy extra time.
    if (new Date() > new Date(attempt.deadline_at)) {
      return finishAttempt(attempt.id, true, res, next, 409);
    }

    const { exam_question_id, answer, marked_for_review, time_spent_sec, visited } = req.body;
    const row = (await db.query(
      'SELECT * FROM attempt_answers WHERE attempt_id = ? AND exam_question_id = ?',
      [attempt.id, exam_question_id]
    )).rows[0];
    if (!row) return res.status(404).json({ error: 'That question is not part of this attempt' });

    await db.query(
      `UPDATE attempt_answers
          SET answer = ?, marked_for_review = ?, visited = ?,
              time_spent_sec = time_spent_sec + ?, updated_at = datetime('now')
        WHERE id = ?`,
      [
        answer === undefined ? row.answer : JSON.stringify(answer),
        marked_for_review === undefined ? row.marked_for_review : (marked_for_review ? 1 : 0),
        visited === undefined ? row.visited : (visited ? 1 : 0),
        Math.max(0, Number(time_spent_sec) || 0),
        row.id,
      ]
    );

    res.json({
      saved: true,
      seconds_remaining: Math.max(
        0, Math.floor((new Date(attempt.deadline_at) - new Date()) / 1000)
      ),
    });
  } catch (err) { next(err); }
}

// Lightweight poll for the exam screen: confirms the clock and reports live
// progress without re-sending the paper.
async function status(req, res, next) {
  try {
    const attempt = (await db.query('SELECT * FROM attempts WHERE id = ?', [req.params.attempt_id])).rows[0];
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.student_id !== req.user.id) return res.status(403).json({ error: 'This is not your attempt' });

    const counts = (await db.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN answer IS NOT NULL AND answer != 'null' THEN 1 ELSE 0 END) AS answered,
              SUM(marked_for_review) AS marked
         FROM attempt_answers WHERE attempt_id = ?`,
      [attempt.id]
    )).rows[0];

    const remaining = Math.max(
      0, Math.floor((new Date(attempt.deadline_at) - new Date()) / 1000)
    );

    // If the clock has expired while the student sat idle, close the attempt
    // on this poll rather than waiting for a submit that may never come.
    if (remaining === 0 && attempt.status === 'in_progress') {
      return finishAttempt(attempt.id, true, res, next);
    }

    res.json({
      status: attempt.status,
      seconds_remaining: remaining,
      total: counts.total,
      answered: counts.answered || 0,
      marked_for_review: counts.marked || 0,
      unanswered: counts.total - (counts.answered || 0),
    });
  } catch (err) { next(err); }
}

async function submit(req, res, next) {
  try {
    const attempt = (await db.query('SELECT * FROM attempts WHERE id = ?', [req.params.attempt_id])).rows[0];
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.student_id !== req.user.id) return res.status(403).json({ error: 'This is not your attempt' });
    if (attempt.status !== 'in_progress') {
      return res.status(409).json({ error: 'This attempt has already been submitted', attempt_id: attempt.id });
    }
    const auto = new Date() > new Date(attempt.deadline_at);
    return finishAttempt(attempt.id, auto, res, next);
  } catch (err) { next(err); }
}

// Shared close-out path for manual submit, expiry-on-save, expiry-on-poll and
// proctoring termination, so an attempt is finalised exactly one way no matter
// what triggered it.
async function finishAttempt(attemptId, auto, res, next, statusCode = 200, reason = null) {
  try {
    const attempt = (await db.query('SELECT * FROM attempts WHERE id = ?', [attemptId])).rows[0];

    if (attempt.status === 'in_progress') {
      const started = new Date(attempt.started_at);
      // A timer expiry is backdated to the deadline; a proctoring termination
      // happened now, so it is stamped now.
      const ended = auto && !reason ? new Date(attempt.deadline_at) : new Date();
      await db.query(
        `UPDATE attempts
            SET submitted_at = ?, auto_submitted = ?, status = 'submitted',
                time_taken_sec = ?, terminated_reason = ?
          WHERE id = ?`,
        [ended.toISOString(), auto ? 1 : 0,
         Math.max(0, Math.floor((ended - started) / 1000)), reason, attemptId]
      );
      await evaluateAttempt(attemptId);
    }

    const exam = (await db.query(
      'SELECT show_result FROM exams WHERE id = ?', [attempt.exam_id]
    )).rows[0];

    const payload = {
      submitted: true,
      auto_submitted: !!auto,
      terminated_reason: reason || attempt.terminated_reason || null,
      attempt_id: attemptId,
      // When the mentor turned off instant results, the report stays sealed
      // until they release it — the client gets the flag, not the marks.
      result_available: !!exam.show_result,
    };

    if (exam.show_result) {
      payload.result = await analytics.studentExamAnalysis(attemptId);
    }

    return res.status(statusCode).json(payload);
  } catch (err) { return next(err); }
}

// Student's own report for one attempt.
async function result(req, res, next) {
  try {
    const attempt = (await db.query('SELECT * FROM attempts WHERE id = ?', [req.params.attempt_id])).rows[0];
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    const isOwner = attempt.student_id === req.user.id;
    if (!isOwner && req.user.role !== 'mentor') {
      return res.status(403).json({ error: 'This is not your result' });
    }
    if (attempt.status === 'in_progress') {
      return res.status(409).json({ error: 'This exam is still in progress' });
    }

    const exam = (await db.query('SELECT show_result FROM exams WHERE id = ?', [attempt.exam_id])).rows[0];
    if (isOwner && !exam.show_result && req.user.role !== 'mentor') {
      return res.status(403).json({ error: 'Your mentor has not released results for this exam yet' });
    }

    res.json(await analytics.studentExamAnalysis(attempt.id));
  } catch (err) { next(err); }
}

// ---- Mentor grading of descriptive answers (journey step 4) ----------------

// The grading queue: every descriptive answer still waiting on a human.
async function pendingGrading(req, res, next) {
  try {
    const rows = (await db.query(
      `SELECT aa.id AS answer_id, aa.answer, aa.attempt_id, aa.grader_comment,
              q.text, q.topic, q.model_answer, eq.marks AS max_marks, eq.position,
              u.id AS student_id, u.name AS student_name, u.roll_no
         FROM attempt_answers aa
         JOIN attempts a       ON a.id = aa.attempt_id
         JOIN users u          ON u.id = a.student_id
         JOIN questions q      ON q.id = aa.question_id
         JOIN exam_questions eq ON eq.id = aa.exam_question_id
        WHERE a.exam_id = ? AND aa.needs_grading = 1
        ORDER BY u.roll_no, eq.position`,
      [req.params.exam_id]
    )).rows;

    res.json(rows.map((r) => ({
      ...r,
      answer: r.answer ? JSON.parse(r.answer) : null,
    })));
  } catch (err) { next(err); }
}

// Awards marks for one or more descriptive answers, then re-finalises each
// affected attempt so totals, pass/fail and ranks all move together.
async function grade(req, res, next) {
  try {
    const items = Array.isArray(req.body.grades) ? req.body.grades : [];
    if (!items.length) return res.status(400).json({ error: 'No marks supplied' });

    const touched = await db.transaction(async () => {
      const attempts = new Set();
      for (const g of items) {
        const row = (await db.query(
          `SELECT aa.*, eq.marks AS max_marks FROM attempt_answers aa
             JOIN exam_questions eq ON eq.id = aa.exam_question_id
            WHERE aa.id = ?`,
          [g.answer_id]
        )).rows[0];
        if (!row) throw Object.assign(new Error(`Answer ${g.answer_id} not found`), { status: 404 });

        const marks = Number(g.marks);
        if (Number.isNaN(marks) || marks < 0 || marks > row.max_marks) {
          throw Object.assign(
            new Error(`Marks for answer ${g.answer_id} must be between 0 and ${row.max_marks}`),
            { status: 400 }
          );
        }

        // A descriptive answer counts as "correct" for topic analytics once it
        // clears half marks — otherwise a 1/10 answer would read as mastery.
        await db.query(
          `UPDATE attempt_answers
              SET marks_awarded = ?, is_correct = ?, needs_grading = 0, grader_comment = ?
            WHERE id = ?`,
          [marks, marks >= row.max_marks / 2 ? 1 : 0, g.comment || null, g.answer_id]
        );
        attempts.add(row.attempt_id);
      }
      return [...attempts];
    });

    for (const id of touched) await finaliseAttempt(id);

    res.json({ graded: items.length, attempts_updated: touched.length });
  } catch (err) { next(err); }
}

// Records a proctoring violation and terminates the paper once the exam's
// tolerance is used up.
//
// The count is held server-side: the browser reports that something happened,
// but it does not get to decide how many strikes remain or when the paper
// ends. A student who edits the client can suppress the report entirely, which
// no browser-based proctoring can prevent — what this does stop is a client
// that reports honestly being talked out of the consequence.
const VIOLATION_LABELS = {
  tab_switch: 'Switched away from the exam tab',
  window_blur: 'Left the exam window',
  fullscreen_exit: 'Exited fullscreen',
  paste: 'Pasted content into an answer',
  context_menu: 'Opened the right-click menu',
};

async function recordViolation(req, res, next) {
  try {
    const attempt = (await db.query('SELECT * FROM attempts WHERE id = ?', [req.params.attempt_id])).rows[0];
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.student_id !== req.user.id) return res.status(403).json({ error: 'This is not your attempt' });

    const exam = (await db.query('SELECT * FROM exams WHERE id = ?', [attempt.exam_id])).rows[0];

    // Nothing to do if the paper is already closed, or if the mentor never
    // switched proctoring on for this exam.
    if (attempt.status !== 'in_progress' || !exam.proctoring) {
      return res.json({
        counted: false,
        violations: attempt.violations,
        limit: exam.max_violations,
        terminated: attempt.status !== 'in_progress',
      });
    }

    const type = VIOLATION_LABELS[req.body.type] ? req.body.type : 'tab_switch';

    await db.query(
      'INSERT INTO attempt_violations (attempt_id, type, detail) VALUES (?,?,?)',
      [attempt.id, type, req.body.detail ? String(req.body.detail).slice(0, 200) : null]
    );
    await db.query('UPDATE attempts SET violations = violations + 1 WHERE id = ?', [attempt.id]);

    const violations = attempt.violations + 1;
    const remaining = Math.max(0, exam.max_violations - violations);

    if (violations >= exam.max_violations) {
      return finishAttempt(attempt.id, true, res, next, 200, 'proctoring');
    }

    res.json({
      counted: true,
      violations,
      limit: exam.max_violations,
      remaining,
      terminated: false,
      message: `${VIOLATION_LABELS[type]}. ${remaining} warning${remaining === 1 ? '' : 's'} left before your paper is submitted.`,
    });
  } catch (err) { next(err); }
}

// The violation log for one exam, so a terminated paper can be reviewed rather
// than just enforced.
async function violationReport(req, res, next) {
  try {
    const rows = (await db.query(
      `SELECT u.id AS student_id, u.name, u.roll_no, a.id AS attempt_id,
              a.violations, a.terminated_reason, a.score, a.percentage,
              v.type, v.occurred_at
         FROM attempts a
         JOIN users u ON u.id = a.student_id
         LEFT JOIN attempt_violations v ON v.attempt_id = a.id
        WHERE a.exam_id = ? AND a.violations > 0
        ORDER BY a.violations DESC, u.roll_no, v.occurred_at`,
      [req.params.exam_id]
    )).rows;

    // Collapse the join into one entry per student with their event list.
    const byStudent = new Map();
    for (const r of rows) {
      if (!byStudent.has(r.attempt_id)) {
        byStudent.set(r.attempt_id, {
          attempt_id: r.attempt_id,
          student_id: r.student_id,
          name: r.name,
          roll_no: r.roll_no,
          violations: r.violations,
          terminated: r.terminated_reason === 'proctoring',
          score: r.score,
          percentage: r.percentage,
          events: [],
        });
      }
      if (r.type) {
        byStudent.get(r.attempt_id).events.push({
          type: r.type,
          label: VIOLATION_LABELS[r.type] || r.type,
          occurred_at: r.occurred_at,
        });
      }
    }

    res.json([...byStudent.values()]);
  } catch (err) { next(err); }
}

module.exports = { start, saveAnswer, status, submit, result, pendingGrading, grade, recordViolation, violationReport };
