// Proctoring behaviour, tested against a running server.
// Run with: node scripts/proctor_test.js

(async () => {
const BASE = process.env.BASE || 'http://localhost:4000';

let pass = 0, fail = 0;
const ok = (l, c, d = '') => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + ' ' + d); } };

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

const login = async (email, password) =>
  (await api('/auth/login', { method: 'POST', body: { email, password } })).body.token;

// Builds a proctored exam that is open right now, with the given tolerance.
async function makeExam(MT, { maxViolations, title }) {
  const bank = await api('/questions?type=mcq', { token: MT });
  const created = await api('/exams', {
    method: 'POST', token: MT,
    body: {
      batch_id: 1, title, subject: 'Data Structures',
      scheduled_at: new Date(Date.now() - 60000).toISOString(),
      duration_min: 60,
      question_ids: bank.body.slice(0, 3).map((q) => q.id),
      proctoring: true, max_violations: maxViolations,
    },
  });
  const pub = await api(`/exams/${created.body.id}/publish`, { method: 'POST', token: MT });
  return { id: created.body.id, code: pub.body.exam_code, exam: created.body };
}

async function run() {
  const MT = await login('admin@apnividya.in', 'mentor123');

  console.log('\n--- Exam settings ---');
  const three = await makeExam(MT, { maxViolations: 3, title: 'Proctor Test — 3 strikes' });
  ok('proctoring persists on the exam', three.exam.proctoring === true);
  ok('violation limit persists', three.exam.max_violations === 3);

  console.log('\n--- Warnings then termination (3 strikes) ---');
  const ST = await login('cse2023002@apnividya.in', 'student123');
  const start = await api(`/exams/${three.id}/start`, { method: 'POST', token: ST });
  ok('attempt starts', start.status === 200);
  ok('student is told the paper is proctored', start.body.exam.proctoring === true);
  const attemptId = start.body.attempt.id;

  // Answer one question so termination has something to mark.
  await api(`/attempts/${attemptId}/answer`, {
    method: 'PATCH', token: ST,
    body: { exam_question_id: start.body.questions[0].exam_question_id, answer: 0, visited: true },
  });

  const v1 = await api(`/attempts/${attemptId}/violation`, {
    method: 'POST', token: ST, body: { type: 'tab_switch' },
  });
  ok('first violation counted', v1.body.counted === true && v1.body.violations === 1);
  ok('first violation does not terminate', !v1.body.submitted);
  ok('remaining warnings reported', v1.body.remaining === 2);
  ok('warning message is human-readable', /warning/i.test(v1.body.message || ''), v1.body.message);

  const v2 = await api(`/attempts/${attemptId}/violation`, {
    method: 'POST', token: ST, body: { type: 'window_blur' },
  });
  ok('second violation counted', v2.body.violations === 2 && !v2.body.submitted);
  ok('remaining decrements', v2.body.remaining === 1);

  const v3 = await api(`/attempts/${attemptId}/violation`, {
    method: 'POST', token: ST, body: { type: 'tab_switch' },
  });
  ok('third violation terminates the paper', v3.body.submitted === true);
  ok('termination reason recorded', v3.body.terminated_reason === 'proctoring');
  ok('terminated paper is still marked', v3.body.result && typeof v3.body.result.attempt.score === 'number');
  ok('answered question still scored', v3.body.result.counts.correct + v3.body.result.counts.incorrect >= 1);
  ok('report exposes the violation count', v3.body.result.attempt.violations === 3);

  console.log('\n--- After termination ---');
  const afterSave = await api(`/attempts/${attemptId}/answer`, {
    method: 'PATCH', token: ST,
    body: { exam_question_id: start.body.questions[1].exam_question_id, answer: 1 },
  });
  ok('cannot answer after termination', afterSave.status === 409);

  const afterSubmit = await api(`/attempts/${attemptId}/submit`, { method: 'POST', token: ST });
  ok('cannot resubmit after termination', afterSubmit.status === 409);

  const extra = await api(`/attempts/${attemptId}/violation`, {
    method: 'POST', token: ST, body: { type: 'tab_switch' },
  });
  ok('further violations are not counted', extra.body.counted === false);
  ok('closed attempt reports as terminated', extra.body.terminated === true);

  const restart = await api(`/exams/${three.id}/start`, { method: 'POST', token: ST });
  ok('cannot restart a terminated paper', restart.status === 409);

  console.log('\n--- Zero tolerance (1 strike) ---');
  const one = await makeExam(MT, { maxViolations: 1, title: 'Proctor Test — no warnings' });
  const ST2 = await login('cse2023003@apnividya.in', 'student123');
  const s2 = await api(`/exams/${one.id}/start`, { method: 'POST', token: ST2 });
  const a2 = s2.body.attempt.id;

  const instant = await api(`/attempts/${a2}/violation`, {
    method: 'POST', token: ST2, body: { type: 'tab_switch' },
  });
  ok('single violation submits immediately', instant.body.submitted === true);
  ok('reason is proctoring, not the timer', instant.body.terminated_reason === 'proctoring');

  console.log('\n--- Unproctored exams are unaffected ---');
  const bank = await api('/questions?type=mcq', { token: MT });
  const plain = await api('/exams', {
    method: 'POST', token: MT,
    body: {
      batch_id: 1, title: 'Proctor Test — off', subject: 'Data Structures',
      scheduled_at: new Date(Date.now() - 60000).toISOString(), duration_min: 60,
      question_ids: bank.body.slice(0, 2).map((q) => q.id),
    },
  });
  await api(`/exams/${plain.body.id}/publish`, { method: 'POST', token: MT });
  ok('proctoring defaults to off', plain.body.proctoring === false);

  const ST3 = await login('cse2023004@apnividya.in', 'student123');
  const s3 = await api(`/exams/${plain.body.id}/start`, { method: 'POST', token: ST3 });
  const a3 = s3.body.attempt.id;
  const ignored = await api(`/attempts/${a3}/violation`, {
    method: 'POST', token: ST3, body: { type: 'tab_switch' },
  });
  ok('violations ignored when proctoring is off', ignored.body.counted === false);
  ok('unproctored paper is not terminated', !ignored.body.submitted);

  const stillOpen = await api(`/attempts/${a3}/answer`, {
    method: 'PATCH', token: ST3,
    body: { exam_question_id: s3.body.questions[0].exam_question_id, answer: 0 },
  });
  ok('unproctored paper stays answerable', stillOpen.status === 200);

  console.log('\n--- Access control ---');
  const otherStudent = await login('cse2023005@apnividya.in', 'student123');
  const notMine = await api(`/attempts/${attemptId}/violation`, {
    method: 'POST', token: otherStudent, body: { type: 'tab_switch' },
  });
  ok('cannot report violations on another student attempt', notMine.status === 403);

  const mentorReport = await api(`/attempts/${attemptId}/violation`, {
    method: 'POST', token: MT, body: { type: 'tab_switch' },
  });
  ok('mentor cannot report violations', mentorReport.status === 403);

  console.log('\n--- Mentor violation report ---');
  const report = await api(`/exams/${three.id}/violations`, { token: MT });
  ok('violation report returns', report.status === 200 && report.body.length === 1);
  const entry = report.body[0];
  ok('report names the student', !!entry.name && !!entry.roll_no);
  ok('report shows the count', entry.violations === 3);
  ok('report flags termination', entry.terminated === true);
  ok('report lists individual events', entry.events.length === 3);
  ok('events carry a timestamp', !!entry.events[0].occurred_at);
  ok('events carry a readable label', /Switched away|Left the exam/.test(entry.events[0].label), entry.events[0].label);
  ok('event types preserved', entry.events.some((e) => e.type === 'window_blur'));

  const studentPeek = await api(`/exams/${three.id}/violations`, { token: ST });
  ok('students cannot read the violation report', studentPeek.status === 403);

  const cleanReport = await api(`/exams/${plain.body.id}/violations`, { token: MT });
  ok('clean exam reports no flags', cleanReport.body.length === 0);

  console.log(`\n${'-'.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'-'.repeat(46)}\n`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('crashed:', e); process.exit(1); });
})().catch((err) => { console.error("[fatal] script failed:", err); process.exit(1); });
