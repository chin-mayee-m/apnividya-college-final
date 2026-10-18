/* --------------------------------------------- STUDENT: EXAM REPORT --- */

SCREENS.sReport = () => {
  const r = state.data.report;
  const a = r.attempt;
  const c = r.counts;
  const plan = r.improvement_plan;
  const mine = !isAdmin();

  return `
  <div class="section" style="text-align:center;margin-bottom:6px;">
    <div class="test-name" style="font-size:17px;">${esc(a.title)}</div>
    <div class="test-sub">${esc(a.subject)} · ${fmtDate(a.scheduled_at)}${mine ? '' : ' · ' + esc(a.student_name)}</div>
  </div>

  ${a.terminated_reason === 'proctoring' ? `<div class="section"><div class="banner warn"
      style="background:var(--coral-light);color:var(--coral);">
    <b>This paper was submitted automatically.</b> It recorded ${a.violations} proctoring
    violation${a.violations === 1 ? '' : 's'} — leaving the exam tab or window.
    Everything you had answered up to that point was marked. Speak to your admin if you
    think this was recorded in error.</div></div>`
    : a.auto_submitted ? `<div class="section"><div class="banner warn">
    This paper was submitted automatically when the timer ran out.</div></div>` : ''}
  ${a.proctoring && a.violations > 0 && a.terminated_reason !== 'proctoring' ? `<div class="section">
    <div class="banner warn">${a.violations} proctoring violation${a.violations === 1 ? '' : 's'}
    recorded during this paper. Your admin can see this.</div></div>` : ''}
  ${c.pending_grading ? `<div class="section"><div class="banner warn">
    ${c.pending_grading} descriptive answer${c.pending_grading > 1 ? 's are' : ' is'} still with your admin.
    Your score will rise once ${c.pending_grading > 1 ? 'they are' : 'it is'} marked.</div></div>` : ''}

  <div class="section" style="display:flex;justify-content:center;align-items:center;gap:12px;margin-bottom:16px;">
    <span class="score-badge lg" style="border-color:${pctColor(a.percentage)};color:${pctColor(a.percentage)};">
      ${a.score}<span class="pct">/ ${a.total_marks}</span></span>
    ${a.passed !== null ? `<span class="pill ${a.passed ? 'ongoing' : ''}"
      style="${a.passed ? '' : 'background:var(--coral-light);color:var(--coral);'}font-size:11px;padding:6px 12px;">
      ${a.passed ? 'Passed' : 'Failed'}</span>` : ''}
  </div>

  <div class="section">
    <div class="mini-stats">
      <div class="mini-stat"><div class="n" style="color:${pctColor(a.percentage)};">${a.percentage}%</div><div class="l">SCORE</div></div>
      <div class="mini-stat"><div class="n">#${a.rank || '—'}</div><div class="l">RANK / ${a.out_of}</div></div>
      <div class="mini-stat"><div class="n" style="color:var(--teal);">${c.correct}</div><div class="l">CORRECT</div></div>
      <div class="mini-stat"><div class="n" style="color:var(--coral);">${c.incorrect}</div><div class="l">INCORRECT</div></div>
    </div>
  </div>
  <div class="section">
    <div class="mini-stats">
      <div class="mini-stat"><div class="n">${c.attempted}</div><div class="l">ATTEMPTED</div></div>
      <div class="mini-stat"><div class="n" style="color:var(--ink-faint);">${c.unattempted}</div><div class="l">SKIPPED</div></div>
      <div class="mini-stat"><div class="n">${mins(a.time_taken_sec)}</div><div class="l">TIME TAKEN</div></div>
      <div class="mini-stat"><div class="n">${mins(r.time_analysis.avg_per_question_sec)}</div><div class="l">PER QUESTION</div></div>
    </div>
  </div>

  ${r.topics.length ? `<div class="section">
    <div class="section-title">Topic-wise analysis</div>
    <div class="card" style="padding:16px;">
      ${r.topics.map((t) => bar(`${t.topic} (${t.correct}/${t.total})`, t.accuracy, bandColor(t.band))).join('')}
    </div></div>` : ''}

  ${plan.items.length ? `<div class="section">
    <div class="section-title">What to improve</div>
    <div class="card" style="padding:4px 16px;">
      ${plan.items.map((i) => `<div class="plan-row"><div class="sig">${i.signal}</div>
        <div style="flex:1;"><div class="pt">${esc(i.topic)} — ${esc(i.label)}</div>
          <div class="pd">${i.accuracy}% accuracy on this paper</div></div></div>`).join('')}
    </div></div>` : ''}

  <div class="section">
    <div class="section-title">Recommended next steps</div>
    <div class="card" style="padding:4px 16px;">
      ${plan.next_steps.map((s, i) => `<div class="step-item"><div class="step-num">${i + 1}</div>
        <div><div class="sa">${esc(s.action)}</div><div class="sd">${esc(s.detail)}</div></div></div>`).join('')}
    </div></div>

  ${r.time_analysis.slowest.length ? `<div class="section">
    <div class="section-title">Where your time went</div>
    <div class="card" style="padding:4px 16px;">
      ${r.time_analysis.slowest.map((s) => `<div class="summary-row">
        <span class="k">Q${s.position + 1} · ${esc(s.topic || '')}</span>
        <span class="v" style="color:${s.over_budget ? 'var(--coral)' : 'var(--ink)'};">
          ${mins(s.time_spent_sec)}${s.over_budget ? ' · over budget' : ''}</span></div>`).join('')}
      <div class="auth-hint" style="padding:6px 0 10px;">
        You had about ${mins(r.time_analysis.budget_per_question_sec)} per question.</div>
    </div></div>` : ''}

  <div class="section">
    <div class="section-title">Question review</div>
    <div class="card" style="padding:6px 16px;">
      ${r.questions.map((q) => questionReview(q)).join('')}
    </div></div>

  <div class="section"><button class="btn ghost full" onclick="go('sLeaderboard',{leaderboardExam:${a.exam_id}})">
    See the leaderboard for this exam →</button></div>`;
};

function questionReview(q) {
  const mark = q.needs_grading ? '<div class="qmark" style="background:var(--amber-light);color:var(--amber);">⋯</div>'
    : q.is_correct === 1 ? '<div class="qmark ok">✓</div>'
    : q.is_correct === 0 ? '<div class="qmark no">✕</div>'
    : '<div class="qmark" style="background:#EDEAE0;color:var(--ink-faint);">–</div>';

  let detail;
  if (q.needs_grading) {
    detail = 'Awaiting your admin’s marks';
  } else if (q.type === 'mcq') {
    const yours = q.your_answer === null ? 'Not answered' : esc(q.options[q.your_answer]);
    detail = `Your answer: ${yours}` + (q.is_correct !== 1 ? ` · Correct: ${esc(q.options[q.correct_index])}` : '');
  } else if (q.type === 'msq') {
    const yours = Array.isArray(q.your_answer) ? q.your_answer.map((i) => esc(q.options[i])).join(', ') : 'Not answered';
    detail = `You chose: ${yours || 'Nothing'}` +
      (q.is_correct !== 1 ? ` · Correct: ${(q.correct_indices || []).map((i) => esc(q.options[i])).join(', ')}` : '');
  } else if (q.type === 'numeric') {
    detail = `Your answer: ${q.your_answer ?? 'Not answered'}` + (q.is_correct !== 1 ? ` · Correct: ${q.correct_number}` : '');
  } else {
    detail = q.grader_comment ? `Admin: ${esc(q.grader_comment)}` : 'Marked by your admin';
  }

  return `<div class="qitem">${mark}
    <div class="qi-text">Q${q.position + 1}. ${esc(q.text)}
      <div class="qi-marks">${detail} · ${q.marks_awarded}/${q.max_marks} marks${q.topic ? ' · ' + esc(q.topic) : ''}</div>
    </div></div>`;
}

/* ------------------------------------------------ STUDENT: RESULTS ---- */

SCREENS.sResults = () => {
  const taken = state.data.exams.filter((e) => e.attempt && e.attempt.status !== 'in_progress');
  if (!taken.length) {
    return `<div class="section"><div class="card empty"><b>No results yet</b>
      Your reports appear here once you have sat an exam.</div></div>`;
  }
  return `<div class="section">${taken.map((e) => `
    <div class="card test-card" onclick="go('sReport',{selectedAttemptId:${e.attempt.id}})">
      <div class="test-top">
        <div><div class="test-name">${esc(e.title)}</div>
          <div class="test-sub">${fmtDate(e.scheduled_at)} · rank #${e.attempt.rank || '—'}</div></div>
        <span class="score-badge" style="border-color:${pctColor(e.attempt.percentage)};color:${pctColor(e.attempt.percentage)};font-size:11px;padding:4px 9px;">
          ${e.attempt.percentage}%</span>
      </div></div>`).join('')}</div>`;
};

/* -------------------------------------------- STUDENT: LEADERBOARD ---- */

SCREENS.sLeaderboard = () => {
  const { board, exams } = state.data;
  const taken = exams.filter((e) => e.attempt && e.attempt.status !== 'in_progress');
  return `
  <div class="section" style="margin-bottom:12px;">
    <select class="field" onchange="setLeaderboardExam(this.value)">
      <option value="overall" ${state.leaderboardExam === 'overall' ? 'selected' : ''}>Overall — average of all tests</option>
      ${taken.map((e) => `<option value="${e.id}" ${String(state.leaderboardExam) === String(e.id) ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}
    </select>
  </div>
  <div class="section">${podium(board, API.user.id, false)}</div>`;
};

/* ----------------------------------------------- STUDENT: PROFILE ----- */

SCREENS.sProfile = () => {
  const p = state.data.perf;
  const s = p.history.summary;
  const u = API.user;
  return `
  <div class="section" style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
    <div class="stamp lg">${initials(u.name)}</div>
    <div style="min-width:0;"><div style="font-family:'Fraunces';font-weight:600;font-size:17px;">${esc(u.name)}</div>
      <div class="test-sub" style="margin-bottom:0;">Student ID ${esc(u.roll_no || '—')} · ${esc(u.department || '')}</div></div>
  </div>
  <div class="section"><div class="stat-grid">
    ${statCard('Average score', s.average_pct + '%', 'var(--teal)')}
    ${statCard('Batch rank', p.class_rank ? `#${p.class_rank} of ${p.class_size}` : '—')}
    ${statCard('Exams taken', s.exams_taken)}
    ${statCard('Best score', s.best_pct + '%', 'var(--teal)')}
  </div></div>

  ${p.recommendations.length ? `<div class="section">
    <div class="section-title">From your admin</div>
    <div class="card">${p.recommendations.map((r) => `<div class="rec-item">
      <div class="rdate"><span>${fmtDate(r.created_at)}</span><span>${esc(r.mentor_name)}</span></div>
      ${r.feedback ? `<div class="rbody">${esc(r.feedback)}</div>` : ''}
      ${r.strengths.length ? `<div class="rtag">Strengths: ${esc(r.strengths.join(', '))}</div>` : ''}
      ${r.improve.length ? `<div class="rtag">To improve: ${esc(r.improve.join(', '))}</div>` : ''}
      ${r.recommendation ? `<div class="rtag" style="color:var(--ink);">Plan: ${esc(r.recommendation)}</div>` : ''}
    </div>`).join('')}</div></div>` : ''}

  <div class="section"><button class="btn ghost full" style="color:var(--coral);border-color:var(--coral-light);" onclick="logout()">Log out</button></div>`;
};

/* ---------------------------------------------------------- BOOT ------ */

// A code in the URL (?code=ABC123) drops a student straight into the briefing,
// which is what makes a shared exam link work as a link.
async function boot() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');

  if (!API.token) { state.screen = 'login'; render(); return; }

  try {
    await API.get('/auth/me');   // confirms the stored token still works
  } catch {
    state.screen = 'login'; render(); return;
  }

  if (code && API.user.role === 'student') {
    await go('sBriefing', { joinCode: code.toUpperCase() }, { push: false });
    return;
  }
  await go(API.user.role === 'admin' ? 'dashboard' : 'sDashboard', {}, { push: false });
}

// Leaving mid-exam is worth a warning; everything else is safe to close.
window.addEventListener('beforeunload', (e) => {
  if (state.screen === 'sPlayer' && state.exam) {
    e.preventDefault();
    e.returnValue = '';
  }
});

boot();
