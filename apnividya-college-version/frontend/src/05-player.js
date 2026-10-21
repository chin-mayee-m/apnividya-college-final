/* --------------------------------------------------- STUDENT: HOME ----- */

SCREENS.sDashboard = () => {
  const { exams = [], perf } = state.data;
  const live = exams.find((e) => e.live_status === 'Ongoing' && (!e.attempt || e.attempt.status === 'in_progress'));
  const next = exams.find((e) => e.live_status === 'Upcoming');
  const s = perf?.history?.summary || { average_pct: 0, exams_taken: 0, best_pct: 0 };
  const rank = perf?.class_rank ? '#' + perf.class_rank : '—';

  const hero = live ? `
    <div class="student-live-card" onclick="startExam(${live.id})">
      <div class="student-live-kicker">LIVE NOW</div>
      <h2>${esc(live.title)}</h2>
      <p>${live.duration_min} min · ${live.total_marks} marks — attempt it before it closes.</p>
      <button class="student-live-btn" onclick="event.stopPropagation();startExam(${live.id});">${live.attempt ? 'Resume Exam →' : 'Start Exam →'}</button>
    </div>` : next ? `
    <div class="student-live-card student-next-card" onclick="goRoot('sExams')">
      <div class="student-live-kicker">NEXT UP</div>
      <h2>${esc(next.title)}</h2>
      <p>${fmtDate(next.scheduled_at)} · ${fmtTime(next.scheduled_at)} · ${next.duration_min} min</p>
      <button class="student-live-btn" onclick="event.stopPropagation();goRoot('sExams');">View My Exams →</button>
    </div>` : `
    <div class="student-live-card student-next-card" onclick="go('sJoin')">
      <div class="student-live-kicker">ALL CAUGHT UP</div>
      <h2>No pending exams</h2>
      <p>Nothing is scheduled right now.</p>
      <button class="student-live-btn" onclick="event.stopPropagation();go('sJoin');">Join an Exam →</button>
    </div>`;

  return `
    <div class="student-dashboard">
      ${hero}

      <section class="student-section">
        <h3 class="student-section-title">My performance</h3>
        <div class="student-performance-grid">
          <div class="student-stat-card"><span>Average score</span><strong class="green">${s.average_pct}%</strong></div>
          <div class="student-stat-card"><span>Class rank</span><strong>${rank}</strong></div>
          <div class="student-stat-card"><span>Exams given</span><strong>${s.exams_taken}</strong></div>
          <div class="student-stat-card"><span>Best score</span><strong class="green">${s.best_pct}%</strong></div>
        </div>
      </section>

      ${perf?.weak_topics?.length ? `<section class="student-section student-work-section">
        <h3 class="student-section-title">Work on these</h3>
        <div class="student-paper-card">${perf.weak_topics.slice(0,3).map((t) => bar(t.topic, t.accuracy, 'var(--teal)')).join('')}</div>
      </section>` : ''}

      <section class="student-section">
        <h3 class="student-section-title">Quick access</h3>
        <div class="student-quick-grid">
          <button class="student-quick-card" onclick="go('sJoin')">${icon('M12 5v14M5 12h14', 22)}<span>My Exams</span></button>
          <button class="student-quick-card" onclick="goRoot('sResults')">${icon(ICONS.analytics, 22)}<span>Results</span></button>
          <button class="student-quick-card" onclick="goRoot('sLeaderboard')">${icon(ICONS.trophy, 22)}<span>Leaders</span></button>
          <button class="student-quick-card" onclick="goRoot('sProfile')">${icon(ICONS.profile, 22)}<span>Profile</span></button>
        </div>
      </section>
    </div>`;
};

/* -------------------------------------------------- STUDENT: EXAMS ----- */

SCREENS.sExams = () => {
  const tabs = ['Ongoing', 'Upcoming', 'Past'];
  const list = state.data.exams.filter((e) => e.live_status === state.examsTab);
  return `
  <div class="uline-tabs">${tabs.map((t) => `<button class="t ${t === state.examsTab ? 'active' : ''}" onclick="setTab('examsTab','${t}')">${t}</button>`).join('')}</div>
  <div class="section" style="margin-bottom:12px;">
    <button class="btn ghost full" onclick="go('sJoin')">Join with an exam code</button>
  </div>
  <div class="section">
    ${list.length ? list.map(studentExamCard).join('')
      : `<div class="card empty"><b>No ${state.examsTab.toLowerCase()} exams</b>Nothing here right now.</div>`}
  </div>`;
};

function studentExamCard(e) {
  const a = e.attempt;
  let action;
  if (a && a.status !== 'in_progress') {
    action = `<button class="btn ghost sm full" onclick="go('sReport',{selectedAttemptId:${a.id}})">
      View report — ${a.percentage}%</button>`;
  } else if (e.live_status === 'Ongoing') {
    action = `<button class="btn sm full" onclick="startExam(${e.id})">${a ? 'Resume Exam' : 'Start Exam'}</button>`;
  } else if (e.live_status === 'Upcoming') {
    action = `<span class="pill upcoming">Opens ${fmtDate(e.scheduled_at)}</span>`;
  } else {
    action = `<span class="pill past">Missed</span>`;
  }

  return `<div class="card test-card" style="cursor:default;">
    <div class="test-top">
      <div><div class="test-name">${esc(e.title)}</div><div class="test-sub">${esc(e.subject)} · ${esc(e.batch_name)}</div></div>
      <span class="pill ${e.live_status.toLowerCase()}">${e.live_status}</span></div>
    <div class="meta-row"><div class="meta">📅 ${fmtDate(e.scheduled_at)}</div><div class="meta">🕐 ${fmtTime(e.scheduled_at)}</div></div>
    <div class="meta-row" style="margin-bottom:12px;"><div class="meta">⏱ ${e.duration_min} min</div>
      <div class="meta">✎ ${e.total_marks} marks</div><div class="meta">◻ ${e.num_questions} Qs</div></div>
    ${action}</div>`;
}

/* ------------------------------------------------- STUDENT: JOIN ------- */

SCREENS.sJoin = () => `
  <div class="section" style="margin-top:20px;">
    <div class="section-title" style="justify-content:center;">Enter your exam code</div>
    <input class="code-input" id="join-code" maxlength="6" placeholder="ABC123" value="${esc(state.joinCode)}"
      oninput="this.value=this.value.toUpperCase()" onkeydown="if(event.key==='Enter')submitCode()">
    <div class="auth-hint" style="text-align:center;padding:0 6px;">
      Your admin shares this six-character code when the exam is published.</div>
  </div>
  <div class="section"><button class="btn full" onclick="submitCode()">Find exam</button></div>`;

function submitCode() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length < 4) { showToast('Enter the full code'); return; }
  go('sBriefing', { joinCode: code });
}

// The pre-exam briefing — everything the student needs before committing.
SCREENS.sBriefing = () => {
  const b = state.data.briefing;
  const done = b.existing_attempt && b.existing_attempt.status !== 'in_progress';

  return `
  <div class="section" style="margin-bottom:14px;">
    <div class="test-name" style="font-size:19px;">${esc(b.title)}</div>
    <div class="test-sub">${esc(b.subject)} · ${esc(b.batch_name)} · set by ${esc(b.mentor_name)}</div>
  </div>
  <div class="section"><div class="card" style="padding:6px 16px;">
    ${row('Starts', `${fmtDate(b.scheduled_at)}, ${fmtTime(b.scheduled_at)}`)}
    ${row('Duration', b.duration_min + ' minutes')}
    ${row('Questions', b.num_questions)}
    ${row('Total marks', b.total_marks)}
    ${row('Passing marks', b.passing_marks)}
    ${row('Negative marking', b.negative_marking ? 'Yes' : 'No')}
    ${row('Status', b.live_status)}
    ${row('Proctored', b.proctoring ? `Yes — ${b.max_violations} strike${b.max_violations === 1 ? '' : 's'}` : 'No')}
  </div></div>
  ${b.proctoring ? `<div class="section"><div class="banner warn">
    <b>This paper is proctored.</b> Leaving the exam tab or window is recorded.
    After ${b.max_violations} such event${b.max_violations === 1 ? '' : 's'} your paper is submitted automatically.
    Close other apps and turn off notifications before you start.
  </div></div>` : ''}
  ${b.instructions ? `<div class="section">
    <div class="section-title">Instructions</div>
    <div class="card" style="padding:14px 16px;font-size:11.5px;line-height:1.65;color:var(--ink-soft);">
      ${esc(b.instructions)}</div></div>` : ''}
  <div class="section">
    ${done ? `<button class="btn ghost full" onclick="go('sReport',{selectedAttemptId:${b.existing_attempt.id}})">You have submitted this — view report</button>`
      : b.can_start ? `<button class="btn full" onclick="startExam(${b.id})">
          ${b.existing_attempt ? 'Resume Exam' : 'Start Exam'}</button>`
      : `<div class="banner warn">${esc(b.blocked_reason || 'This exam is not open right now.')}</div>`}
  </div>`;
};

/* ----------------------------------------------- STUDENT: EXAM PLAYER -- */

async function startExam(examId) {
  try {
    const data = await API.post(`/exams/${examId}/start`);

    state.exam = data;
    state.qIndex = 0;
    state.paletteOpen = false;
    state.secondsLeft = data.attempt.seconds_remaining;
    state.questionEnteredAt = Date.now();

    // Seed local answer state from the server, so a resumed attempt comes back
    // exactly as the student left it.
    state.answers = {};
    data.questions.forEach((q) => {
      state.answers[q.exam_question_id] = {
        answer: q.answer, marked_for_review: q.marked_for_review, dirty: false,
      };
    });

    state.stack = [];
    state.screen = 'sPlayer';
    state.proctorWarning = null;
    startTicker();
    if (data.exam.proctoring) armProctoring();
    render();
  } catch (err) {
    showToast(err.message);
    if (err.data && err.data.attempt_id) go('sReport', { selectedAttemptId: err.data.attempt_id });
  }
}

// The countdown is local for smoothness but reconciled against the server every
// 15 seconds, so the clock a student sees is the clock the server enforces.
function startTicker() {
  if (state.ticker) clearInterval(state.ticker);
  let sinceSync = 0;

  state.ticker = setInterval(async () => {
    state.secondsLeft -= 1;
    sinceSync += 1;

    if (state.secondsLeft <= 0) {
      clearInterval(state.ticker);
      state.ticker = null;
      await autoSubmit();
      return;
    }

    const el = document.getElementById('timer');
    if (el) {
      el.textContent = clock(state.secondsLeft);
      el.className = 'timer ' + (state.secondsLeft < 120 ? 'danger' : state.secondsLeft < 300 ? 'warn' : '');
    }

    if (sinceSync >= 15) {
      sinceSync = 0;
      try {
        const st = await API.get(`/attempts/${state.exam.attempt.id}/status`);
        if (st.status && st.status !== 'in_progress') {
          clearInterval(state.ticker); state.ticker = null;
          showToast('Time is up — your paper was submitted');
          await go('sReport', { selectedAttemptId: state.exam.attempt.id }, { push: false });
          return;
        }
        // Trust the server's remaining time over the local drift.
        if (typeof st.seconds_remaining === 'number') state.secondsLeft = st.seconds_remaining;
      } catch { /* a dropped poll is not fatal; the next tick retries */ }
    }
  }, 1000);
}

async function autoSubmit() {
  try {
    const res = await API.post(`/attempts/${state.exam.attempt.id}/submit`);
    showToast('Time is up — your paper was submitted');
    await finishExam(res);
  } catch (err) {
    showToast(err.message);
    await goRoot('sExams');
  }
}

async function finishExam(res) {
  if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
  disarmProctoring();
  const attemptId = res.attempt_id || state.exam.attempt.id;
  state.exam = null;
  state.answers = {};
  state.stack = [];
  if (res.result_available === false) {
    showToast('Submitted — your admin will release results');
    await goRoot('sExams');
  } else {
    await go('sReport', { selectedAttemptId: attemptId }, { push: false });
  }
}

function playerScreen() {
  const { questions, exam } = state.exam;
  const q = questions[state.qIndex];
  const local = state.answers[q.exam_question_id];
  const answered = questions.filter((x) => {
    const a = state.answers[x.exam_question_id];
    return a && a.answer !== null && a.answer !== undefined && a.answer !== '';
  }).length;

  return `
  <div class="exam-bar">
    <div><div class="qcount">Question ${state.qIndex + 1} / ${questions.length}</div>
      <div class="qsub">${answered} answered · ${questions.length - answered} left
        ${exam.proctoring ? '<span class="proctor-chip" style="margin-left:6px;">● Proctored</span>' : ''}</div></div>
    <div class="timer ${state.secondsLeft < 120 ? 'danger' : state.secondsLeft < 300 ? 'warn' : ''}" id="timer">${clock(state.secondsLeft)}</div>
  </div>
  <div class="progress-strip">
    ${questions.map((x) => {
      const a = state.answers[x.exam_question_id] || {};
      const has = a.answer !== null && a.answer !== undefined && a.answer !== '';
      return `<i class="${a.marked_for_review ? 'rev' : has ? 'done' : ''}"></i>`;
    }).join('')}
  </div>

  <div class="scroll-area">
    <div class="qbody">
      <div class="qtext">${esc(q.text)}</div>
      <div class="qmeta">${q.marks} mark${q.marks > 1 ? 's' : ''} · ${esc(q.type.toUpperCase())}
        ${exam.negative_marking && q.negative_marks > 0 ? `<span class="neg"> · −${q.negative_marks} if wrong</span>` : ''}</div>
      ${answerInput(q, local)}
      <button class="review-btn ${local.marked_for_review ? 'on' : ''}" onclick="toggleReview()">
        ${local.marked_for_review ? '★ Marked for review' : '☆ Mark for review'}</button>
    </div>
  </div>

  <div class="exam-nav">
    <button class="btn ghost" onclick="prevQ()" ${state.qIndex === 0 ? 'disabled' : ''}>← Previous</button>
    <button class="btn ghost" style="flex:0 0 46px;padding:11px 0;justify-content:center;" onclick="togglePalette()">${ICONS.grid}</button>
    ${state.qIndex === questions.length - 1
      ? `<button class="btn" onclick="confirmSubmit()">Submit</button>`
      : `<button class="btn" onclick="nextQ()">Next →</button>`}
  </div>
  ${state.paletteOpen ? paletteSheet(questions, answered) : ''}
  ${state.proctorWarning ? proctorSheet() : ''}`;
}

function answerInput(q, local) {
  if (q.type === 'mcq') {
    return q.options.map((op, i) => `<div class="option-btn ${local.answer === i ? 'selected' : ''}"
      onclick="pick(${i})">${esc(op)}</div>`).join('');
  }
  if (q.type === 'msq') {
    const sel = Array.isArray(local.answer) ? local.answer : [];
    return `<div style="font-size:10.5px;color:var(--ink-faint);font-weight:700;margin-bottom:8px;">Select all that apply</div>` +
      q.options.map((op, i) => `<div class="option-btn ${sel.includes(i) ? 'selected' : ''}"
        onclick="pickMulti(${i})">${esc(op)}</div>`).join('');
  }
  if (q.type === 'numeric') {
    return `<input class="num-input" type="number" step="any" placeholder="Your answer"
      value="${local.answer ?? ''}" oninput="setValue(this.value===''?null:Number(this.value))">`;
  }
  return `<textarea class="field" rows="7" placeholder="Write your answer…"
    oninput="setValue(this.value)">${esc(local.answer ?? '')}</textarea>`;
}

function paletteSheet(questions, answered) {
  const marked = questions.filter((x) => (state.answers[x.exam_question_id] || {}).marked_for_review).length;
  return `<div class="palette-sheet" onclick="togglePalette()">
    <div class="palette-panel" onclick="event.stopPropagation()">
      <div class="section-title" style="margin-bottom:2px;">Question navigator</div>
      <div style="font-size:10.5px;color:var(--ink-soft);font-weight:600;">
        ${answered} answered · ${questions.length - answered} left · ${marked} marked</div>
      <div class="palette-grid">
        ${questions.map((x, i) => {
          const a = state.answers[x.exam_question_id] || {};
          const has = a.answer !== null && a.answer !== undefined && a.answer !== '';
          const cls = a.marked_for_review ? 'review' : has ? 'answered' : '';
          return `<button class="pcell ${cls} ${i === state.qIndex ? 'current' : ''}" onclick="jumpTo(${i})">${i + 1}</button>`;
        }).join('')}
      </div>
      <div class="plegend">
        <span><i style="background:var(--teal);"></i>Answered</span>
        <span><i style="background:var(--amber);"></i>Marked for review</span>
        <span><i style="background:var(--paper-card);border:1.5px solid var(--rule);"></i>Not answered</span>
      </div>
      <div style="margin-top:16px;"><button class="btn full" onclick="confirmSubmit()">Submit exam</button></div>
    </div></div>`;
}

/* ---- Player interactions. Every change saves to the server immediately. --- */

function currentQ() { return state.exam.questions[state.qIndex]; }

function pick(i) {
  setValue(i);
}

function pickMulti(i) {
  const local = state.answers[currentQ().exam_question_id];
  const sel = Array.isArray(local.answer) ? [...local.answer] : [];
  const at = sel.indexOf(i);
  if (at >= 0) sel.splice(at, 1); else sel.push(i);
  setValue(sel.sort());
}

function setValue(value) {
  const q = currentQ();
  state.answers[q.exam_question_id].answer = value;
  // MCQ and MSQ re-render to move the selection highlight; text and numeric
  // inputs must not re-render or the caret would jump on every keystroke.
  if (q.type === 'mcq' || q.type === 'msq') render();
  autosave();
}

function toggleReview() {
  const q = currentQ();
  const local = state.answers[q.exam_question_id];
  local.marked_for_review = !local.marked_for_review;
  render();
  autosave();
}

// Debounced so typing a descriptive answer produces one save per pause rather
// than one per keystroke.
let saveTimer = null;
function autosave({ immediate = false } = {}) {
  clearTimeout(saveTimer);
  const run = () => {
    const q = currentQ();
    if (!q || !state.exam) return;
    const local = state.answers[q.exam_question_id];
    const spent = state.questionEnteredAt ? Math.round((Date.now() - state.questionEnteredAt) / 1000) : 0;
    state.questionEnteredAt = Date.now();

    API.patch(`/attempts/${state.exam.attempt.id}/answer`, {
      exam_question_id: q.exam_question_id,
      answer: local.answer,
      marked_for_review: local.marked_for_review,
      visited: true,
      time_spent_sec: spent,
    }).catch((err) => {
      // A failed save on an already-closed attempt means the clock ran out.
      if (err.status === 409) {
        showToast('Time is up — your paper was submitted');
        if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
        go('sReport', { selectedAttemptId: state.exam.attempt.id }, { push: false });
      }
    });
  };
  if (immediate) run(); else saveTimer = setTimeout(run, 700);
}

function jumpTo(i) {
  autosave({ immediate: true });
  state.qIndex = i;
  state.paletteOpen = false;
  state.questionEnteredAt = Date.now();
  render();
}
function nextQ() { if (state.qIndex < state.exam.questions.length - 1) jumpTo(state.qIndex + 1); }
function prevQ() { if (state.qIndex > 0) jumpTo(state.qIndex - 1); }
function togglePalette() { state.paletteOpen = !state.paletteOpen; render(); }

// Submitting ends the attempt for good, so the count of what is unanswered is
// stated plainly before the student confirms.
function confirmSubmit() {
  const qs = state.exam.questions;
  const unanswered = qs.filter((x) => {
    const a = state.answers[x.exam_question_id];
    return !a || a.answer === null || a.answer === undefined || a.answer === '';
  }).length;
  const marked = qs.filter((x) => (state.answers[x.exam_question_id] || {}).marked_for_review).length;

  let msg = 'Submit your paper? You cannot reopen it afterwards.';
  if (unanswered || marked) {
    msg = `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}`
      + (marked ? ` and ${marked} still marked for review` : '')
      + '.\n\nSubmit anyway? You cannot reopen the paper afterwards.';
  }
  if (!window.confirm(msg)) return;
  doSubmit();
}

async function doSubmit() {
  try {
    autosave({ immediate: true });
    await new Promise((r) => setTimeout(r, 250)); // let the last save land
    const res = await API.post(`/attempts/${state.exam.attempt.id}/submit`);
    showToast('Submitted');
    await finishExam(res);
  } catch (err) { showToast(err.message); }
}

/* ------------------------------------------------------- PROCTORING ---- */

// Browser-side proctoring. This detects a student leaving the exam surface and
// reports it; the server decides what it costs.
//
// What it cannot do is worth stating plainly: it sees the exam tab losing
// focus, not the room. A second device, a person in the room, or a student who
// disables JavaScript are all invisible to it. It raises the effort required
// for casual lookup-in-another-tab cheating, which is the realistic threat in
// an unsupervised online test, and it is not a substitute for supervision.

let proctorHandlers = null;
let blurTimer = null;

function armProctoring() {
  if (state.proctorArmed) return;
  state.proctorArmed = true;

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') reportViolation('tab_switch');
  };

  // A blur without the tab going hidden means another window took focus.
  // It is checked on a delay because clicking the address bar, a password
  // manager, or an OS notification all fire blur for a fraction of a second,
  // and none of those is a student looking something up.
  const onBlur = () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (!document.hasFocus() && document.visibilityState === 'visible') {
        reportViolation('window_blur');
      }
    }, 1500);
  };
  const onFocus = () => clearTimeout(blurTimer);

  // Pasting into a descriptive answer is blocked outright rather than merely
  // counted — the point is to stop the paste, not to punish it afterwards.
  const onPaste = (e) => {
    if (e.target && e.target.closest && e.target.closest('.qbody')) {
      e.preventDefault();
      reportViolation('paste');
    }
  };

  const onContextMenu = (e) => {
    if (e.target && e.target.closest && e.target.closest('.qbody')) e.preventDefault();
  };

  proctorHandlers = { onVisibility, onBlur, onFocus, onPaste, onContextMenu };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  document.addEventListener('paste', onPaste, true);
  document.addEventListener('contextmenu', onContextMenu);
}

function disarmProctoring() {
  if (!proctorHandlers) { state.proctorArmed = false; return; }
  const h = proctorHandlers;
  document.removeEventListener('visibilitychange', h.onVisibility);
  window.removeEventListener('blur', h.onBlur);
  window.removeEventListener('focus', h.onFocus);
  document.removeEventListener('paste', h.onPaste, true);
  document.removeEventListener('contextmenu', h.onContextMenu);
  clearTimeout(blurTimer);
  proctorHandlers = null;
  state.proctorArmed = false;
}

// Several events can fire for one physical action (a tab switch on some
// browsers fires both blur and visibilitychange), so reports are throttled to
// one per two seconds. Otherwise a single Alt-Tab could burn every warning at
// once, which would be indefensible to a student.
let lastReport = 0;

async function reportViolation(type) {
  if (!state.exam || state.screen !== 'sPlayer') return;
  const now = Date.now();
  if (now - lastReport < 2000) return;
  lastReport = now;

  try {
    const res = await API.post(`/attempts/${state.exam.attempt.id}/violation`, { type });

    if (res.submitted) {
      // Tolerance used up — the server has already closed the paper.
      disarmProctoring();
      if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
      state.proctorWarning = null;
      showToast('Paper submitted — too many violations');
      await finishExam(res);
      return;
    }

    if (res.counted) {
      state.proctorWarning = { message: res.message, remaining: res.remaining };
      render();
    }
  } catch (err) {
    // A failed report must not break the exam the student is sitting.
    console.warn('violation report failed', err.message);
  }
}

function dismissProctorWarning() {
  state.proctorWarning = null;
  render();
}

function proctorSheet() {
  const w = state.proctorWarning;
  return `<div class="proctor-sheet">
    <div class="proctor-card">
      <div class="ico">⚠️</div>
      <h4>Warning</h4>
      <p>${esc(w.message)}</p>
      <div class="strikes">${w.remaining} warning${w.remaining === 1 ? '' : 's'} remaining</div>
      <button class="btn full" onclick="dismissProctorWarning()">Return to my paper</button>
    </div></div>`;
}
