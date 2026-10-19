const db = require('./../config/db');

// Thresholds that decide what counts as a strong vs weak topic. Kept here as
// named constants so the mentor view, the student view and the recommendation
// generator all agree on where the lines sit.
const STRONG_AT = 75;
const WEAK_BELOW = 50;

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function band(percentage) {
  if (percentage >= STRONG_AT) return 'strong';
  if (percentage >= WEAK_BELOW) return 'moderate';
  return 'weak';
}

// ---------------------------------------------------------------------------
// Class-level analysis for one exam (mentor dashboard, journey step 5).
// ---------------------------------------------------------------------------
async function examAnalytics(examId) {
  const exam = (await db.query('SELECT * FROM exams WHERE id = ?', [examId])).rows[0];
  if (!exam) throw Object.assign(new Error('Exam not found'), { status: 404 });

  const totalStudents = (await db.query(
    'SELECT COUNT(*) AS c FROM enrollments WHERE batch_id = ?',
    [exam.batch_id]
  )).rows[0].c;

  const attempts = (await db.query(
    `SELECT a.*, u.name, u.roll_no
       FROM attempts a
       JOIN users u ON u.id = a.student_id
      WHERE a.exam_id = ? AND a.status IN ('submitted','evaluated')
      ORDER BY a.score DESC`,
    [examId]
  )).rows;

  const appeared = attempts.length;
  const scores = attempts.map((a) => a.score);
  const passCount = attempts.filter((a) => a.score >= exam.passing_marks).length;

  const summary = {
    total_students: totalStudents,
    appeared,
    absent: Math.max(0, totalStudents - appeared),
    average_score: appeared ? Math.round((scores.reduce((s, v) => s + v, 0) / appeared) * 10) / 10 : 0,
    highest_score: appeared ? Math.max(...scores) : 0,
    lowest_score: appeared ? Math.min(...scores) : 0,
    total_marks: exam.total_marks,
    passing_marks: exam.passing_marks,
    pass_count: passCount,
    fail_count: appeared - passCount,
    pass_pct: pct(passCount, appeared),
    fail_pct: pct(appeared - passCount, appeared),
    class_average_pct: appeared
      ? Math.round((scores.reduce((s, v) => s + v, 0) / appeared / (exam.total_marks || 1)) * 1000) / 10
      : 0,
  };

  // Score distribution in the same five bands the UI's donut renders.
  const buckets = [
    { label: '90–100', min: 90, max: 101 },
    { label: '80–89', min: 80, max: 90 },
    { label: '70–79', min: 70, max: 80 },
    { label: '60–69', min: 60, max: 70 },
    { label: 'Below 60', min: -1, max: 60 },
  ];
  const distribution = buckets.map((b) => {
    const count = attempts.filter((a) => a.percentage >= b.min && a.percentage < b.max).length;
    return { label: b.label, count, pct: pct(count, appeared) };
  });

  return {
    exam: publicExam(exam),
    summary,
    distribution,
    topics: await topicPerformance({ examId }),
    questions: await questionPerformance(examId),
    difficulty: await difficultyPerformance(examId),
    leaderboard: attempts.map((a, i) => ({
      rank: a.rank || i + 1,
      student_id: a.student_id,
      name: a.name,
      roll_no: a.roll_no,
      score: a.score,
      max_marks: a.max_marks,
      percentage: a.percentage,
      passed: a.passed,
    })),
  };
}

// ---------------------------------------------------------------------------
// Topic-wise accuracy. Scoped to one exam, one student, or one student across
// every exam — the same aggregate answers all three questions.
// ---------------------------------------------------------------------------
async function topicPerformance({ examId = null, studentId = null }) {
  const where = ['q.topic IS NOT NULL', "at.status IN ('submitted','evaluated')"];
  const params = [];
  if (examId) { where.push('at.exam_id = ?'); params.push(examId); }
  if (studentId) { where.push('at.student_id = ?'); params.push(studentId); }

  const rows = (await db.query(
    `SELECT q.topic,
            COUNT(*)                                        AS total,
            SUM(CASE WHEN aa.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
            SUM(CASE WHEN aa.is_correct = 0 THEN 1 ELSE 0 END) AS incorrect,
            SUM(CASE WHEN aa.is_correct IS NULL THEN 1 ELSE 0 END) AS unattempted
       FROM attempt_answers aa
       JOIN attempts  at ON at.id = aa.attempt_id
       JOIN questions q  ON q.id  = aa.question_id
      WHERE ${where.join(' AND ')}
      GROUP BY q.topic
      ORDER BY q.topic`,
    params
  )).rows;

  return rows.map((r) => {
    const accuracy = pct(r.correct, r.total);
    return {
      topic: r.topic,
      total: r.total,
      correct: r.correct,
      incorrect: r.incorrect,
      unattempted: r.unattempted,
      accuracy,
      band: band(accuracy),
    };
  }).sort((a, b) => b.accuracy - a.accuracy);
}

// Per-question accuracy, used for "most incorrect questions" and the
// question-difficulty read-out on the mentor's exam view.
async function questionPerformance(examId) {
  const rows = (await db.query(
    `SELECT q.id, q.text, q.topic, q.difficulty, eq.marks, eq.position,
            COUNT(aa.id)                                       AS attempts,
            SUM(CASE WHEN aa.is_correct = 1 THEN 1 ELSE 0 END)    AS correct,
            SUM(CASE WHEN aa.is_correct = 0 THEN 1 ELSE 0 END)    AS incorrect,
            SUM(CASE WHEN aa.is_correct IS NULL THEN 1 ELSE 0 END) AS skipped
       FROM exam_questions eq
       JOIN questions q ON q.id = eq.question_id
       LEFT JOIN attempt_answers aa ON aa.exam_question_id = eq.id
       LEFT JOIN attempts at ON at.id = aa.attempt_id
                            AND at.status IN ('submitted','evaluated')
      WHERE eq.exam_id = ?
      GROUP BY eq.id
      ORDER BY eq.position`,
    [examId]
  )).rows;

  return rows.map((r) => ({
    question_id: r.id,
    position: r.position,
    text: r.text,
    topic: r.topic,
    difficulty: r.difficulty,
    marks: r.marks,
    attempts: r.attempts,
    correct: r.correct,
    incorrect: r.incorrect,
    skipped: r.skipped,
    accuracy: pct(r.correct, r.attempts),
  }));
}

// Groups accuracy by the difficulty the mentor tagged, which is how you find
// out that "easy" questions are quietly the ones the class is failing.
async function difficultyPerformance(examId) {
  const qs = await questionPerformance(examId);
  const levels = ['easy', 'medium', 'hard'];
  return levels.map((level) => {
    const subset = qs.filter((q) => q.difficulty === level);
    const attempts = subset.reduce((s, q) => s + q.attempts, 0);
    const correct = subset.reduce((s, q) => s + q.correct, 0);
    return {
      difficulty: level,
      questions: subset.length,
      attempts,
      correct,
      accuracy: pct(correct, attempts),
    };
  }).filter((d) => d.questions > 0);
}

// ---------------------------------------------------------------------------
// One student's report for one exam (journey step 6).
// ---------------------------------------------------------------------------
async function studentExamAnalysis(attemptId) {
  const attempt = (await db.query(
    `SELECT a.*, u.name, u.roll_no, e.title, e.subject, e.total_marks, e.passing_marks,
            e.duration_min, e.scheduled_at, e.show_result, e.batch_id, e.proctoring
       FROM attempts a
       JOIN users u ON u.id = a.student_id
       JOIN exams e ON e.id = a.exam_id
      WHERE a.id = ?`,
    [attemptId]
  )).rows[0];
  if (!attempt) throw Object.assign(new Error('Attempt not found'), { status: 404 });

  const answers = (await db.query(
    `SELECT aa.*, q.text, q.type, q.topic, q.options, q.correct_index, q.correct_indices,
            q.correct_number, q.model_answer, q.difficulty, eq.marks AS max_marks, eq.position
       FROM attempt_answers aa
       JOIN questions q       ON q.id = aa.question_id
       JOIN exam_questions eq ON eq.id = aa.exam_question_id
      WHERE aa.attempt_id = ?
      ORDER BY eq.position`,
    [attemptId]
  )).rows;

  const correct = answers.filter((a) => a.is_correct === 1).length;
  const incorrect = answers.filter((a) => a.is_correct === 0).length;
  const unattempted = answers.filter((a) => a.is_correct === null && !a.needs_grading).length;
  const pendingGrading = answers.filter((a) => a.needs_grading === 1).length;

  const appeared = (await db.query(
    `SELECT COUNT(*) AS c FROM attempts
      WHERE exam_id = ? AND status IN ('submitted','evaluated')`,
    [attempt.exam_id]
  )).rows[0].c;

  const topics = await topicPerformance({ examId: attempt.exam_id, studentId: attempt.student_id });

  return {
    attempt: {
      id: attempt.id,
      exam_id: attempt.exam_id,
      student_id: attempt.student_id,
      student_name: attempt.name,
      roll_no: attempt.roll_no,
      title: attempt.title,
      subject: attempt.subject,
      scheduled_at: attempt.scheduled_at,
      score: attempt.score,
      total_marks: attempt.total_marks,
      passing_marks: attempt.passing_marks,
      percentage: attempt.percentage,
      rank: attempt.rank,
      out_of: appeared,
      passed: attempt.passed,
      status: attempt.status,
      auto_submitted: !!attempt.auto_submitted,
      terminated_reason: attempt.terminated_reason,
      violations: attempt.violations,
      proctoring: !!attempt.proctoring,
      time_taken_sec: attempt.time_taken_sec,
      duration_min: attempt.duration_min,
    },
    counts: {
      total_questions: answers.length,
      correct,
      incorrect,
      unattempted,
      attempted: answers.length - unattempted,
      pending_grading: pendingGrading,
    },
    topics,
    strong_topics: topics.filter((t) => t.band === 'strong'),
    weak_topics: topics.filter((t) => t.band === 'weak'),
    time_analysis: timeAnalysis(answers, attempt),
    questions: answers.map((a) => ({
      position: a.position,
      question_id: a.question_id,
      text: a.text,
      type: a.type,
      topic: a.topic,
      difficulty: a.difficulty,
      options: a.options ? JSON.parse(a.options) : null,
      your_answer: a.answer ? JSON.parse(a.answer) : null,
      correct_index: a.correct_index,
      correct_indices: a.correct_indices ? JSON.parse(a.correct_indices) : null,
      correct_number: a.correct_number,
      model_answer: a.model_answer,
      is_correct: a.is_correct,
      marks_awarded: a.marks_awarded,
      max_marks: a.max_marks,
      needs_grading: !!a.needs_grading,
      grader_comment: a.grader_comment,
      time_spent_sec: a.time_spent_sec,
      marked_for_review: !!a.marked_for_review,
    })),
    improvement_plan: improvementPlan(topics),
  };
}

// Per-question pacing. Flags questions where the student burned well over their
// fair share of the clock, which is usually a comprehension problem rather than
// a speed problem.
function timeAnalysis(answers, attempt) {
  const totalTime = answers.reduce((s, a) => s + (a.time_spent_sec || 0), 0);
  const avg = answers.length ? Math.round(totalTime / answers.length) : 0;
  const budget = attempt.duration_min * 60 / (answers.length || 1);

  return {
    total_time_sec: totalTime,
    avg_per_question_sec: avg,
    budget_per_question_sec: Math.round(budget),
    slowest: [...answers]
      .sort((a, b) => (b.time_spent_sec || 0) - (a.time_spent_sec || 0))
      .slice(0, 3)
      .map((a) => ({
        position: a.position,
        topic: a.topic,
        time_spent_sec: a.time_spent_sec || 0,
        over_budget: (a.time_spent_sec || 0) > budget * 1.5,
        is_correct: a.is_correct,
      })),
  };
}

// Turns topic bands into the "what to improve" list and concrete next steps.
// This is the step that makes a result actionable rather than just a number.
function improvementPlan(topics) {
  const items = topics.map((t) => ({
    topic: t.topic,
    accuracy: t.accuracy,
    band: t.band,
    signal: t.band === 'weak' ? '🔴' : t.band === 'moderate' ? '🟡' : '🟢',
    label: t.band === 'weak' ? 'Weak' : t.band === 'moderate' ? 'Needs practice' : 'Strong',
  }));

  const weak = items.filter((i) => i.band === 'weak').map((i) => i.topic);
  const moderate = items.filter((i) => i.band === 'moderate').map((i) => i.topic);

  const steps = [];
  if (weak.length) {
    steps.push({
      action: 'Revise weak topics',
      detail: `Go back through ${weak.slice(0, 3).join(', ')} before the next test.`,
    });
  }
  if (moderate.length) {
    steps.push({
      action: 'Practice selected questions',
      detail: `Work a set of mixed problems on ${moderate.slice(0, 3).join(', ')} to firm these up.`,
    });
  }
  steps.push({
    action: 'Take a revision test',
    detail: weak.length
      ? `Re-test on ${weak[0]} once you have revised it, to confirm the gap has closed.`
      : 'Sit a timed mixed-topic test to hold your accuracy under time pressure.',
  });

  return { items, next_steps: steps };
}

// ---------------------------------------------------------------------------
// Cross-exam history (journey step 8) — is this student actually improving?
// ---------------------------------------------------------------------------
async function studentHistory(studentId) {
  const rows = (await db.query(
    `SELECT a.id AS attempt_id, a.score, a.max_marks, a.percentage, a.rank, a.passed,
            a.submitted_at, e.id AS exam_id, e.title, e.subject, e.scheduled_at
       FROM attempts a
       JOIN exams e ON e.id = a.exam_id
      WHERE a.student_id = ? AND a.status IN ('submitted','evaluated')
      ORDER BY e.scheduled_at ASC`,
    [studentId]
  )).rows;

  const trend = rows.map((r, i) => {
    const prev = i > 0 ? rows[i - 1].percentage : null;
    return {
      ...r,
      delta: prev === null ? null : Math.round((r.percentage - prev) * 10) / 10,
      direction: prev === null ? 'first' : r.percentage > prev ? 'up' : r.percentage < prev ? 'down' : 'flat',
    };
  });

  const percentages = rows.map((r) => r.percentage);
  const first = percentages[0];
  const last = percentages[percentages.length - 1];

  return {
    exams: trend,
    summary: {
      exams_taken: rows.length,
      average_pct: rows.length
        ? Math.round((percentages.reduce((s, v) => s + v, 0) / rows.length) * 10) / 10
        : 0,
      best_pct: rows.length ? Math.max(...percentages) : 0,
      latest_pct: last || 0,
      overall_change: rows.length > 1 ? Math.round((last - first) * 10) / 10 : 0,
      // A single exam is not a trajectory, so this stays honest about sample size.
      verdict: rows.length < 2
        ? 'Not enough exams yet to read a trend'
        : last > first ? 'Improving' : last < first ? 'Declining' : 'Holding steady',
    },
  };
}

// ---------------------------------------------------------------------------
// Individual student view for the mentor (journey step 7).
// ---------------------------------------------------------------------------
async function studentOverview(studentId) {
  const student = (await db.query(
    'SELECT id, name, email, roll_no, department FROM users WHERE id = ? AND role = ?',
    [studentId, 'student']
  )).rows[0];
  if (!student) throw Object.assign(new Error('Student not found'), { status: 404 });

  const history = await studentHistory(studentId);
  const topics = await topicPerformance({ studentId });

  const att = (await db.query(
    `SELECT COUNT(*) AS total, SUM(present) AS present
       FROM attendance WHERE student_id = ?`,
    [studentId]
  )).rows[0];
  const attendancePct = pct(att.present || 0, att.total || 0);

  const assignments = (await db.query(
    `SELECT a.title, a.max_marks, s.marks, s.submitted
       FROM assignments a
       LEFT JOIN assignment_scores s
              ON s.assignment_id = a.id AND s.student_id = ?
      WHERE a.batch_id IN (SELECT batch_id FROM enrollments WHERE student_id = ?)
      ORDER BY a.due_date`,
    [studentId, studentId]
  )).rows;

  const submitted = assignments.filter((a) => a.submitted);
  const assignmentPct = pct(
    submitted.reduce((s, a) => s + (a.marks || 0), 0),
    submitted.reduce((s, a) => s + a.max_marks, 0)
  );

  return {
    student,
    history,
    topics,
    strong_topics: topics.filter((t) => t.band === 'strong'),
    weak_topics: topics.filter((t) => t.band === 'weak'),
    attendance: {
      total_days: att.total || 0,
      present_days: att.present || 0,
      attendance_pct: attendancePct,
      // Stated as an observed alignment, not a causal claim — with one class's
      // worth of data that is as much as the number can honestly support.
      correlation_note: correlationNote(attendancePct, history.summary.average_pct),
    },
    assignments: {
      total: assignments.length,
      submitted: submitted.length,
      missed: assignments.length - submitted.length,
      average_pct: assignmentPct,
      items: assignments,
    },
    recommendations: (await db.query(
      `SELECT r.*, u.name AS mentor_name
         FROM recommendations r
         JOIN users u ON u.id = r.mentor_id
        WHERE r.student_id = ?
        ORDER BY r.created_at DESC`,
      [studentId]
    )).rows.map(hydrateRecommendation),
  };
}

function correlationNote(attendancePct, examPct) {
  if (!attendancePct) return 'No attendance recorded yet.';
  const gap = attendancePct - examPct;
  if (attendancePct >= 85 && examPct >= 75) return 'High attendance alongside strong scores.';
  if (attendancePct >= 85 && examPct < 60) return 'Attending regularly but scores lag — likely a comprehension gap, not an effort gap.';
  if (attendancePct < 70 && examPct < 60) return 'Low attendance alongside low scores — missed classes are the first thing to address.';
  if (gap > 25) return 'Attendance is well ahead of results.';
  return 'Attendance and results are broadly in line.';
}

// ---------------------------------------------------------------------------
// Mentor home dashboard.
// ---------------------------------------------------------------------------
async function mentorDashboard(mentorId) {
  const exams = (await db.query('SELECT * FROM exams WHERE created_by = ?', [mentorId])).rows;
  const examIds = exams.map((e) => e.id);

  if (examIds.length === 0) {
    return {
      tests_conducted: 0, students_appeared: 0, class_average_pct: 0, pass_pct: 0,
      trend: [], top_topics: [], weak_topics: [],
    };
  }

  const placeholders = examIds.map(() => '?').join(',');
  const attempts = (await db.query(
    `SELECT a.*, e.passing_marks
       FROM attempts a JOIN exams e ON e.id = a.exam_id
      WHERE a.exam_id IN (${placeholders}) AND a.status IN ('submitted','evaluated')`,
    examIds
  )).rows;

  const passed = attempts.filter((a) => a.score >= a.passing_marks).length;
  const conducted = exams.filter((e) => examIds.includes(e.id)
    && attempts.some((a) => a.exam_id === e.id));

  // Chronological class-average trend across exams that actually ran.
  const trend = exams
    .filter((e) => attempts.some((a) => a.exam_id === e.id))
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .map((e) => {
      const rows = attempts.filter((a) => a.exam_id === e.id);
      return {
        exam_id: e.id,
        title: e.title,
        scheduled_at: e.scheduled_at,
        average_pct: Math.round(
          (rows.reduce((s, a) => s + a.percentage, 0) / rows.length) * 10
        ) / 10,
      };
    });

  const allTopics = await topicPerformance({});

  return {
    tests_total: exams.length,
    tests_conducted: conducted.length,
    students_appeared: attempts.length,
    class_average_pct: attempts.length
      ? Math.round((attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) * 10) / 10
      : 0,
    pass_pct: pct(passed, attempts.length),
    trend,
    top_topics: allTopics.slice(0, 3),
    weak_topics: [...allTopics].reverse().slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Strips answer keys and internal columns from an exam row before it is sent to
// any client.
function publicExam(e) {
  return {
    id: e.id,
    title: e.title,
    subject: e.subject,
    batch_id: e.batch_id,
    scheduled_at: e.scheduled_at,
    duration_min: e.duration_min,
    total_marks: e.total_marks,
    passing_marks: e.passing_marks,
    num_questions: e.num_questions,
    question_type: e.question_type,
    instructions: e.instructions,
    exam_code: e.exam_code,
    status: e.status,
    shuffle: !!e.shuffle,
    show_result: !!e.show_result,
    negative_marking: !!e.negative_marking,
    proctoring: !!e.proctoring,
    max_violations: e.max_violations,
  };
}

function hydrateRecommendation(r) {
  return {
    ...r,
    strengths: r.strengths ? JSON.parse(r.strengths) : [],
    improve: r.improve ? JSON.parse(r.improve) : [],
  };
}

module.exports = {
  examAnalytics,
  topicPerformance,
  questionPerformance,
  difficultyPerformance,
  studentExamAnalysis,
  studentHistory,
  studentOverview,
  mentorDashboard,
  improvementPlan,
  publicExam,
  hydrateRecommendation,
  pct,
  band,
};
