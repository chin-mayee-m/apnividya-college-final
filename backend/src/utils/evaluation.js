const db = require('./../config/db');

// Parses a stored answer. Answers are persisted as JSON so a single column can
// hold an index, an array of indices, a number, or descriptive text.
function parseAnswer(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// True when the student left the question alone. An empty string or an empty
// selection counts as unattempted, not as a wrong answer — the distinction
// matters for negative marking and for the attempted/unattempted counters.
function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// Grades one answer against its question.
// Returns { status, marks, needsGrading } where status is
// 'correct' | 'incorrect' | 'unattempted' | 'pending'.
function gradeAnswer(question, rawAnswer, examMarks, negativeMarkingOn) {
  const answer = parseAnswer(rawAnswer);
  const max = examMarks != null ? examMarks : question.marks;

  if (question.type === 'descriptive') {
    // Nothing to auto-grade. A blank descriptive answer is still zero, but it
    // does not go into the mentor's grading queue.
    if (isBlank(answer)) {
      return { status: 'unattempted', marks: 0, needsGrading: 0 };
    }
    return { status: 'pending', marks: 0, needsGrading: 1 };
  }

  if (isBlank(answer)) {
    return { status: 'unattempted', marks: 0, needsGrading: 0 };
  }

  let correct = false;

  if (question.type === 'mcq') {
    correct = Number(answer) === Number(question.correct_index);
  } else if (question.type === 'msq') {
    // All-or-nothing: the selected set must match the key exactly.
    const key = JSON.parse(question.correct_indices || '[]').map(Number).sort();
    const given = (Array.isArray(answer) ? answer : [answer]).map(Number).sort();
    correct = key.length === given.length && key.every((v, i) => v === given[i]);
  } else if (question.type === 'numeric') {
    const given = Number(answer);
    if (!Number.isNaN(given)) {
      const tol = question.tolerance || 0;
      correct = Math.abs(given - Number(question.correct_number)) <= tol;
    }
  }

  if (correct) return { status: 'correct', marks: max, needsGrading: 0 };

  const penalty = negativeMarkingOn ? Number(question.negative_marks || 0) : 0;
  return { status: 'incorrect', marks: -penalty, needsGrading: 0 };
}

// Auto-evaluates every answer in an attempt and writes the result back.
// Descriptive answers are flagged for the mentor and contribute 0 until graded.
async function evaluateAttempt(attemptId) {
  const attempt = (await db.query('SELECT * FROM attempts WHERE id = ?', [attemptId])).rows[0];
  if (!attempt) throw Object.assign(new Error('Attempt not found'), { status: 404 });

  const exam = (await db.query('SELECT * FROM exams WHERE id = ?', [attempt.exam_id])).rows[0];

  const answers = (await db.query(
    `SELECT aa.*, q.type, q.correct_index, q.correct_indices, q.correct_number,
            q.tolerance, q.negative_marks, q.marks AS bank_marks, eq.marks AS exam_marks
       FROM attempt_answers aa
       JOIN questions q       ON q.id = aa.question_id
       JOIN exam_questions eq ON eq.id = aa.exam_question_id
      WHERE aa.attempt_id = ?`,
    [attemptId]
  )).rows;

  let score = 0;
  let pendingCount = 0;

  for (const a of answers) {
    const result = gradeAnswer(a, a.answer, a.exam_marks, exam.negative_marking);
    score += result.marks;
    if (result.needsGrading) pendingCount += 1;

    await db.query(
      `UPDATE attempt_answers
          SET is_correct = ?, marks_awarded = ?, needs_grading = ?
        WHERE id = ?`,
      [
        result.status === 'correct' ? 1 : result.status === 'incorrect' ? 0 : null,
        result.marks,
        result.needsGrading,
        a.id,
      ]
    );
  }

  return await finaliseAttempt(attemptId, score, pendingCount, exam);
}

// Writes the attempt-level totals. Called after auto-evaluation and again after
// a mentor grades descriptive answers, so totals always reflect current marks.
async function finaliseAttempt(attemptId, scoreOverride, pendingCount, examRow) {
  const attempt = (await db.query('SELECT * FROM attempts WHERE id = ?', [attemptId])).rows[0];
  const exam = examRow || (await db.query('SELECT * FROM exams WHERE id = ?', [attempt.exam_id])).rows[0];

  const score = scoreOverride != null
    ? scoreOverride
    : (await db.query(
        'SELECT COALESCE(SUM(marks_awarded),0) AS s FROM attempt_answers WHERE attempt_id = ?',
        [attemptId]
      )).rows[0].s;

  const pending = pendingCount != null
    ? pendingCount
    : (await db.query(
        'SELECT COUNT(*) AS c FROM attempt_answers WHERE attempt_id = ? AND needs_grading = 1',
        [attemptId]
      )).rows[0].c;

  // Marks never go below zero, however aggressive the negative marking.
  const finalScore = Math.max(0, Math.round(score * 100) / 100);
  const maxMarks = exam.total_marks;
  const percentage = maxMarks > 0 ? Math.round((finalScore / maxMarks) * 1000) / 10 : 0;

  // An attempt with descriptive answers outstanding stays 'submitted'; it only
  // becomes 'evaluated' once every question carries a mark.
  const status = pending > 0 ? 'submitted' : 'evaluated';
  const passed = pending > 0 ? null : finalScore >= exam.passing_marks ? 1 : 0;

  await db.query(
    `UPDATE attempts
        SET score = ?, max_marks = ?, percentage = ?, passed = ?, status = ?
      WHERE id = ?`,
    [finalScore, maxMarks, percentage, passed, status, attemptId]
  );

  await recomputeRanks(attempt.exam_id);

  return (await db.query('SELECT * FROM attempts WHERE id = ?', [attemptId])).rows[0];
}

// Competition ranking (1,2,2,4) across everyone who has submitted this exam.
// Recomputed on every submission and every grading change so a rank shown to a
// student is never stale relative to the cohort.
async function recomputeRanks(examId) {
  const rows = (await db.query(
    `SELECT id, score FROM attempts
      WHERE exam_id = ? AND status IN ('submitted','evaluated')
      ORDER BY score DESC, submitted_at ASC`,
    [examId]
  )).rows;

  let lastScore = null;
  let lastRank = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rank = row.score === lastScore ? lastRank : i + 1;
    lastScore = row.score;
    lastRank = rank;
    await db.query('UPDATE attempts SET rank = ? WHERE id = ?', [rank, row.id]);
  }
}

module.exports = {
  parseAnswer,
  isBlank,
  gradeAnswer,
  evaluateAttempt,
  finaliseAttempt,
  recomputeRanks,
};
