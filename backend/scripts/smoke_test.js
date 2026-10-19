// End-to-end walk through the whole journey against a running server.
// Run with: node scripts/smoke_test.js   (server must be up)

(async () => {
const BASE = process.env.BASE || 'http://localhost:4000';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label} ${detail}`);
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

async function run() {
  console.log('\n--- Auth ---');
  const mentorLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@apnividya.in', password: 'mentor123' },
  });
  check('mentor logs in', mentorLogin.status === 200 && mentorLogin.body.token);
  const MT = mentorLogin.body.token;

  const studentLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'jee2027001@apnividya.in', password: 'student123' },
  });
  check('student logs in', studentLogin.status === 200 && studentLogin.body.token);
  const ST = studentLogin.body.token;

  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@apnividya.in', password: 'wrong' },
  });
  check('wrong password rejected', badLogin.status === 401);

  const noToken = await api('/api/analytics/dashboard');
  check('unauthenticated request rejected', noToken.status === 401);

  const wrongRole = await api('/api/analytics/dashboard', { token: ST });
  check('student cannot read mentor dashboard', wrongRole.status === 403);

  const bankPeek = await api('/api/questions', { token: ST });
  check('student cannot read the question bank', bankPeek.status === 403);

  console.log('\n--- Mentor dashboard & exam list ---');
  const dash = await api('/api/analytics/dashboard', { token: MT });
  check('dashboard returns totals', dash.status === 200 && dash.body.tests_total > 0);
  check('dashboard has a class average', dash.body.class_average_pct > 0);
  check('dashboard reports weak topics', Array.isArray(dash.body.weak_topics) && dash.body.weak_topics.length > 0);
  check('dashboard trend is populated', dash.body.trend.length >= 3);

  const exams = await api('/api/exams', { token: MT });
  check('exam list returns exams', exams.status === 200 && exams.body.length >= 5);
  const statuses = new Set(exams.body.map((e) => e.live_status));
  check('exam statuses derive from the clock', statuses.has('Draft') && statuses.has('Ongoing') && statuses.has('Past'),
    `got ${[...statuses].join(',')}`);
  check('a draft exam has no code', exams.body.some((e) => e.live_status === 'Draft' && !e.exam_code));

  const pastExam = exams.body.find((e) => e.live_status === 'Past' && e.appeared > 0);
  check('past exam has students appeared', !!pastExam && pastExam.appeared > 0);

  console.log('\n--- Class analytics (journey step 5) ---');
  const an = await api(`/api/exams/${pastExam.id}/analytics`, { token: MT });
  check('analytics returns', an.status === 200);
  const s = an.body.summary;
  check('total students counted', s.total_students === 3);
  check('appeared <= total', s.appeared <= s.total_students);
  check('average between lowest and highest',
    s.average_score >= s.lowest_score && s.average_score <= s.highest_score,
    `low=${s.lowest_score} avg=${s.average_score} high=${s.highest_score}`);
  check('pass% + fail% = 100', Math.abs(s.pass_pct + s.fail_pct - 100) < 0.2);
  check('distribution sums to appeared',
    an.body.distribution.reduce((a, d) => a + d.count, 0) === s.appeared);
  check('topic performance present', an.body.topics.length > 0);
  check('topics carry a strong/weak band',
    an.body.topics.every((t) => ['strong', 'moderate', 'weak'].includes(t.band)));
  check('question-level accuracy present', an.body.questions.length > 0);
  check('difficulty breakdown present', an.body.difficulty.length > 0);
  check('leaderboard is ranked descending',
    an.body.leaderboard.every((r, i, arr) => i === 0 || arr[i - 1].score >= r.score));

  console.log('\n--- Descriptive grading (journey step 4) ---');
  const midTerm = exams.body.find((e) => e.pending_grading > 0);
  check('an exam has answers awaiting grading', !!midTerm);
  const queue = await api(`/api/exams/${midTerm.id}/pending-grading`, { token: MT });
  check('grading queue returns items', queue.status === 200 && queue.body.length > 0);

  const item = queue.body[0];
  const beforeAttempt = await api(`/api/attempts/${item.attempt_id}/result`, { token: MT });
  check('ungraded attempt is still "submitted"', beforeAttempt.body.attempt.status === 'submitted');
  const scoreBefore = beforeAttempt.body.attempt.score;

  const overMax = await api('/api/attempts/grade', {
    method: 'POST', token: MT,
    body: { grades: [{ answer_id: item.answer_id, marks: item.max_marks + 5 }] },
  });
  check('marks above the maximum are rejected', overMax.status === 400);

  const graded = await api('/api/attempts/grade', {
    method: 'POST', token: MT,
    body: { grades: [{ answer_id: item.answer_id, marks: item.max_marks, comment: 'Clear and complete.' }] },
  });
  check('grading succeeds', graded.status === 200 && graded.body.graded === 1);

  const afterAttempt = await api(`/api/attempts/${item.attempt_id}/result`, { token: MT });
  check('score increased after grading', afterAttempt.body.attempt.score > scoreBefore,
    `${scoreBefore} -> ${afterAttempt.body.attempt.score}`);

  console.log('\n--- Individual student view (journey step 7) ---');
  const students = await api('/api/students', { token: MT });
  check('student list returns', students.status === 200 && students.body.length === 12);
  check('students are ranked by average', students.body[0].average_pct >= students.body[11].average_pct);

  const sid = students.body[0].id;
  const ov = await api(`/api/students/${sid}/overview`, { token: MT });
  check('overview returns', ov.status === 200);
  check('overview has exam history', ov.body.history.exams.length >= 2);
  check('overview reports a trend verdict', !!ov.body.history.summary.verdict);
  check('overview has topic breakdown', ov.body.topics.length > 0);
  check('overview has attendance correlation', typeof ov.body.attendance.attendance_pct === 'number'
    && !!ov.body.attendance.correlation_note);
  check('overview has assignment performance', ov.body.assignments.total > 0);
  check('overview includes recommendations', Array.isArray(ov.body.recommendations));

  console.log('\n--- Recommendations ---');
  const rec = await api(`/api/students/${sid}/recommendations`, {
    method: 'POST', token: MT,
    body: {
      feedback: 'Strong across the board.',
      strengths: ['Concept clarity'],
      improve: ['Dynamic Programming'],
      recommendation: 'Three DP problems a day for two weeks.',
    },
  });
  check('recommendation saves', rec.status === 201 && rec.body.strengths.length === 1);

  const emptyRec = await api(`/api/students/${sid}/recommendations`, {
    method: 'POST', token: MT, body: { feedback: '  ' },
  });
  check('empty recommendation rejected', emptyRec.status === 400);

  console.log('\n--- Create & publish an exam (journey step 1) ---');
  const bank = await api('/api/questions', { token: MT });
  check('question bank returns', bank.status === 200 && bank.body.length > 15);

  const sets = await api('/api/questions/sets', { token: MT });
  check('saved question sets return', sets.status === 200 && sets.body.length > 0);

  // Objective-only, so this exam is fully auto-evaluated and pass/fail is
  // decided at submit rather than waiting on a human grader.
  const objective = bank.body.filter((q) => q.type === 'mcq');
  const created = await api('/api/exams', {
    method: 'POST', token: MT,
    body: {
      batch_id: 1,
      title: 'Smoke Test Exam',
      subject: 'JEE Main',
      scheduled_at: new Date(Date.now() - 60000).toISOString(),
      duration_min: 30,
      instructions: 'Answer everything.',
      question_ids: objective.slice(0, 3).map((q) => q.id),
      new_questions: [{
        topic: 'Kinematics', type: 'mcq', text: 'Smoke: which is O(1) on an array?',
        options: ['Index access', 'Linear search', 'Sorting', 'Reversing'],
        correct_index: 0, marks: 2, difficulty: 'easy',
      }],
    },
  });
  check('exam creates', created.status === 201, JSON.stringify(created.body).slice(0, 120));
  check('total marks computed server-side', created.body.total_marks > 0);
  check('question count correct', created.body.num_questions === 4);
  check('unpublished exam has no code', !created.body.exam_code);
  const newExamId = created.body.id;

  const noQuestions = await api('/api/exams', {
    method: 'POST', token: MT,
    body: { batch_id: 1, title: 'Empty', subject: 'JEE Main', scheduled_at: new Date().toISOString() },
  });
  check('exam with no questions rejected', noQuestions.status === 400);

  const pub = await api(`/api/exams/${newExamId}/publish`, { method: 'POST', token: MT });
  check('exam publishes', pub.status === 200 && !!pub.body.exam_code);
  check('publish returns a join link', !!pub.body.join_url);
  const CODE = pub.body.exam_code;

  console.log('\n--- Student joins and attempts (journey steps 2-3) ---');
  const badCode = await api('/api/exams/code/ZZZZZZ', { token: ST });
  check('unknown exam code returns 404', badCode.status === 404);

  const join = await api(`/api/exams/code/${CODE}`, { token: ST });
  check('join by code returns the briefing', join.status === 200 && join.body.title === 'Smoke Test Exam');
  check('briefing carries instructions', !!join.body.instructions);
  check('briefing says the exam can start', join.body.can_start === true);
  check('briefing hides questions', join.body.questions === undefined);

  const start = await api(`/api/exams/${newExamId}/start`, { method: 'POST', token: ST });
  check('attempt starts', start.status === 200 && !!start.body.attempt.id);
  check('server returns a countdown', start.body.attempt.seconds_remaining > 0);
  check('questions delivered', start.body.questions.length === 4);
  const leaked = start.body.questions.some((q) =>
    'correct_index' in q || 'correct_indices' in q || 'correct_number' in q);
  check('no answer key leaks to the student', !leaked);

  const attemptId = start.body.attempt.id;
  const qs = start.body.questions;

  const resume = await api(`/api/exams/${newExamId}/start`, { method: 'POST', token: ST });
  check('re-starting resumes the same attempt', resume.body.attempt.id === attemptId);

  console.log('\n--- Autosave, review flags, timer ---');
  const save1 = await api(`/api/attempts/${attemptId}/answer`, {
    method: 'PATCH', token: ST,
    body: { exam_question_id: qs[0].exam_question_id, answer: 0, visited: true, time_spent_sec: 12 },
  });
  check('answer autosaves', save1.status === 200 && save1.body.saved);

  await api(`/api/attempts/${attemptId}/answer`, {
    method: 'PATCH', token: ST,
    body: { exam_question_id: qs[1].exam_question_id, answer: 1, marked_for_review: true, visited: true, time_spent_sec: 30 },
  });
  await api(`/api/attempts/${attemptId}/answer`, {
    method: 'PATCH', token: ST,
    body: { exam_question_id: qs[3].exam_question_id, answer: 0, visited: true, time_spent_sec: 20 },
  });

  const st = await api(`/api/attempts/${attemptId}/status`, { token: ST });
  check('status tracks answered count', st.body.answered === 3, `got ${st.body.answered}`);
  check('status tracks unanswered', st.body.unanswered === 1);
  check('status tracks marked for review', st.body.marked_for_review === 1);
  check('status returns time remaining', st.body.seconds_remaining > 0);

  const otherSave = await api(`/api/attempts/${attemptId}/answer`, {
    method: 'PATCH', token: MT,
    body: { exam_question_id: qs[0].exam_question_id, answer: 2 },
  });
  check('a mentor cannot write to a student attempt', otherSave.status === 403);

  console.log('\n--- Submit & auto-evaluate (journey step 4) ---');
  const sub = await api(`/api/attempts/${attemptId}/submit`, { method: 'POST', token: ST });
  check('attempt submits', sub.status === 200 && sub.body.submitted);
  check('result returned immediately', !!sub.body.result);

  const r = sub.body.result;
  check('score computed', typeof r.attempt.score === 'number');
  check('percentage computed', typeof r.attempt.percentage === 'number');
  check('rank assigned', r.attempt.rank >= 1);
  check('pass/fail decided', r.attempt.passed !== null && r.attempt.passed !== undefined);
  check('counts add up',
    r.counts.correct + r.counts.incorrect + r.counts.unattempted + r.counts.pending_grading === r.counts.total_questions,
    JSON.stringify(r.counts));
  check('unattempted counted', r.counts.unattempted === 1);
  check('per-question review returned', r.questions.length === 4);
  check('correct answers now revealed in the report', r.questions[0].correct_index !== undefined);
  check('topic analysis present', r.topics.length > 0);
  check('improvement plan generated', r.improvement_plan.next_steps.length > 0);
  check('improvement items are banded',
    r.improvement_plan.items.every((i) => ['🔴', '🟡', '🟢'].includes(i.signal)));
  check('time analysis present', r.time_analysis.total_time_sec > 0);

  const resubmit = await api(`/api/attempts/${attemptId}/submit`, { method: 'POST', token: ST });
  check('double submit rejected', resubmit.status === 409);

  const lateSave = await api(`/api/attempts/${attemptId}/answer`, {
    method: 'PATCH', token: ST,
    body: { exam_question_id: qs[2].exam_question_id, answer: 0 },
  });
  check('cannot answer after submitting', lateSave.status === 409);

  console.log('\n--- Student personal analysis (journey steps 6 & 8) ---');
  const perf = await api('/api/students/me/performance', { token: ST });
  check('student performance returns', perf.status === 200);
  check('history spans multiple exams', perf.body.history.exams.length >= 2);
  check('trend deltas computed', perf.body.history.exams.slice(1).every((e) => e.delta !== null));
  check('trend directions set', perf.body.history.exams.slice(1).every((e) =>
    ['up', 'down', 'flat'].includes(e.direction)));
  check('class rank returned', perf.body.class_rank >= 1);
  check('weak topics identified', Array.isArray(perf.body.weak_topics));
  check('improvement plan returned', perf.body.improvement_plan.next_steps.length > 0);
  check('student sees own recommendations', perf.body.recommendations.length > 0);

  const myExams = await api('/api/exams/mine', { token: ST });
  check('student exam list returns', myExams.status === 200 && myExams.body.length > 0);
  check('attempt state folded into exam list', myExams.body.some((e) => e.attempt && e.attempt.status));
  check('draft exams hidden from students', !myExams.body.some((e) => e.status === 'draft'));

  console.log('\n--- Leaderboard ---');
  const lbOverall = await api('/api/analytics/leaderboard?exam_id=overall', { token: ST });
  check('overall leaderboard returns', lbOverall.status === 200 && lbOverall.body.length === 12);
  check('overall leaderboard ranked', lbOverall.body[0].rank === 1);
  check('overall leaderboard sorted', lbOverall.body.every((x, i, a) =>
    i === 0 || a[i - 1].percentage >= x.percentage));

  const lbExam = await api(`/api/analytics/leaderboard?exam_id=${pastExam.id}`, { token: ST });
  check('per-exam leaderboard returns', lbExam.status === 200 && lbExam.body.length > 0);

  console.log('\n--- Locking rules ---');
  const editLocked = await api(`/api/exams/${newExamId}/questions`, {
    method: 'PUT', token: MT,
    body: { questions: [{ question_id: objective[0].id, marks: 1 }] },
  });
  check('cannot edit questions once attempted', editLocked.status === 409);

  const delLocked = await api(`/api/exams/${newExamId}`, { method: 'DELETE', token: MT });
  check('cannot delete an attempted exam', delLocked.status === 409);

  console.log(`\n${'-'.repeat(46)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`${'-'.repeat(46)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\nSmoke test crashed:', err);
  process.exit(1);
});
})().catch((err) => { console.error("[fatal] script failed:", err); process.exit(1); });
