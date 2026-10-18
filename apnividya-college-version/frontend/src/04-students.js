
/* ------------------------------------------------------ ADMIN: BATCHES --- */

SCREENS.batches = () => {
  const batches = state.data.batches || [];
  return `
  <div class="section">
    <div class="dashboard-welcome-row">
      <div>
        <div class="page-kicker">College administration</div>
        <h1>Batches</h1>
        <p>Create and manage the student groups that tests are assigned to.</p>
      </div>
      <button class="btn primary-action" onclick="openCreateBatch()">+ Create Batch</button>
    </div>
  </div>

  <div class="section">
    ${batches.length ? `<div class="card" style="padding:4px 16px;">
      ${batches.map((b) => `<div class="student-row">
        <div class="stamp" style="width:38px;height:38px;font-size:11px;">${initials(b.name)}</div>
        <div class="info">
          <div class="nm">${esc(b.name)}</div>
          <div class="sc">${b.student_count || 0} student${Number(b.student_count) === 1 ? '' : 's'}</div>
        </div>
        <button class="btn sm ghost" onclick="event.stopPropagation();openCreateTestForBatch(${b.id})">Create Test</button>
      </div>`).join('')}
    </div>` : `<div class="card empty"><b>No batches yet</b>Create your first college batch to start creating tests.</div>`}
  </div>`;
};

function openCreateBatch() {
  const name = window.prompt('Batch name (for example: TY CSE-DS A or SYJC Science A)');
  if (name === null) return;
  const clean = name.trim();
  if (!clean) { showToast('Enter a batch name'); return; }
  createBatch(clean);
}

async function createBatch(name) {
  try {
    await API.post('/batches', { name });
    showToast('Batch created');
    await load();
  } catch (err) { showToast(err.message); }
}

function openCreateTestForBatch(batchId) {
  openCreateTest();
  state.draft.batch_id = batchId;
  state.draft.subject = '';
  render();
}

/* -------------------------------------------------- MENTOR: ANALYTICS --- */

SCREENS.analytics = () => {
  const { stats, topics } = state.data;
  const strong = topics.filter((t) => t.band === 'strong');
  const weak = topics.filter((t) => t.band === 'weak');
  const moderate = topics.filter((t) => t.band === 'moderate');

  return `
  <div class="section">
    <div class="card chart-card">
      <div class="section-title">Batch average across tests</div>
      ${sparkline(stats.trend.map((t) => t.average_pct), stats.trend.map((_, i) => 'T' + (i + 1)))}
    </div>
    ${stats.trend.length > 1 ? `<div class="auth-hint" style="padding:0 2px;">
      ${esc(stats.trend[0].title)} → ${esc(stats.trend[stats.trend.length - 1].title)}:
      ${(stats.trend[stats.trend.length - 1].average_pct - stats.trend[0].average_pct).toFixed(1)} points.
    </div>` : ''}
  </div>

  <div class="section">
    <div class="stat-grid">
      ${statCard('Tests conducted', stats.tests_conducted)}
      ${statCard('Papers submitted', stats.students_appeared)}
      ${statCard('Batch average', stats.class_average_pct + '%', 'var(--teal)')}
      ${statCard('Pass percentage', stats.pass_pct + '%', 'var(--teal)')}
    </div>
  </div>

  ${strong.length ? `<div class="section"><div class="section-title">Strong topics</div>
    <div class="card" style="padding:16px;">${strong.map((t) => bar(t.topic, t.accuracy, 'var(--teal)')).join('')}</div>
  </div>` : ''}
  ${moderate.length ? `<div class="section"><div class="section-title">Needs practice</div>
    <div class="card" style="padding:16px;">${moderate.map((t) => bar(t.topic, t.accuracy, 'var(--amber)')).join('')}</div>
  </div>` : ''}
  ${weak.length ? `<div class="section"><div class="section-title">Weak topics</div>
    <div class="card" style="padding:16px;">${weak.map((t) => bar(t.topic, t.accuracy, 'var(--coral)')).join('')}</div>
    <div class="auth-hint" style="padding:0 2px;">Accuracy across every test this class has sat. These are the topics to re-teach before the next paper.</div>
  </div>` : ''}`;
};

/* --------------------------------------------------- MENTOR: STUDENTS --- */

SCREENS.students = () => {
  const { leaderboard, exams } = state.data;
  const conducted = exams.filter((e) => e.appeared > 0);
  const q = state.searchQuery.trim().toLowerCase();
  const list = leaderboard.filter((r) => !q || r.name.toLowerCase().includes(q) || String(r.roll_no || '').toLowerCase().includes(q));

  return `
  <div class="section" style="margin-bottom:10px;">
    <select class="field" onchange="setLeaderboardExam(this.value)">
      <option value="overall" ${state.leaderboardExam === 'overall' ? 'selected' : ''}>Overall — average of all tests</option>
      ${conducted.map((e) => `<option value="${e.id}" ${String(state.leaderboardExam) === String(e.id) ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}
    </select>
  </div>
  <div class="section" style="margin-bottom:12px;">
    <div class="search-bar">${ICONS.search}
      <input placeholder="Search by name or roll number" value="${esc(state.searchQuery)}" oninput="searchStudents(this.value)"></div>
  </div>
  <div class="section">${podium(list, null, true)}</div>`;
};

function setLeaderboardExam(v) { state.leaderboardExam = v; load(); }
function searchStudents(v) {
  state.searchQuery = v;
  const el = document.getElementById('scroll');
  const pos = el ? el.scrollTop : 0;
  render();
  const el2 = document.getElementById('scroll');
  if (el2) el2.scrollTop = pos;
  const input = document.querySelector('.search-bar input');
  if (input) { input.focus(); input.setSelectionRange(v.length, v.length); }
}

// Shared by the mentor's Students tab and the student's Leaderboard, so both
// read the same ranking rather than two implementations that could diverge.
function podium(list, highlightId, clickable) {
  if (!list.length) {
    return `<div class="card empty"><b>No results yet</b>Nobody has a score for this selection.</div>`;
  }
  const top3 = list.slice(0, 3);
  const rest = list.slice(3);
  const specs = [{ i: 1, h: 58, c: 'var(--gold)', big: false }, { i: 0, h: 76, c: 'var(--gold)', big: true }, { i: 2, h: 46, c: '#C1652C', big: false }];

  let podiumHtml = '';
  if (top3.length >= 2) {
    podiumHtml = `<div class="podium">${specs.filter((p) => top3[p.i]).map((p) => {
      const x = top3[p.i];
      const you = x.student_id === highlightId;
      const click = clickable ? `onclick="go('studentDetail',{selectedStudentId:${x.student_id},studentTab:'Overview'})" style="cursor:pointer;"` : '';
      return `<div class="podium-col" ${click}>
        ${p.big ? '<div style="font-size:16px;margin-bottom:2px;">👑</div>' : '<div style="height:20px;"></div>'}
        <div class="stamp" style="width:${p.big ? 46 : 36}px;height:${p.big ? 46 : 36}px;font-size:${p.big ? 13 : 11}px;margin-bottom:6px;${you ? 'border-color:var(--teal);' : ''}">${initials(x.name)}</div>
        <div class="pname">${esc(x.name.split(' ')[0])}${you ? ' <span class="you-pill">You</span>' : ''}</div>
        <div class="ppct">${x.percentage}%</div>
        <div class="podium-block" style="height:${p.h}px;background:${p.c};">${p.i + 1}</div>
      </div>`;
    }).join('')}</div>`;
  }

  const rows = (top3.length < 2 ? list : rest).map((x, i) => {
    const rank = x.rank || (top3.length < 2 ? i + 1 : i + 4);
    const you = x.student_id === highlightId;
    const click = clickable ? `onclick="go('studentDetail',{selectedStudentId:${x.student_id},studentTab:'Overview'})"` : '';
    return `<div class="student-row ${you ? 'you-row' : ''}" style="cursor:${clickable ? 'pointer' : 'default'};" ${click}>
      <div class="rank-badge ${rank === 1 ? 'top' : ''}">${rank}</div>
      <div class="stamp" style="width:36px;height:36px;font-size:11px;">${initials(x.name)}</div>
      <div class="info"><div class="nm">${esc(x.name)}${you ? ' <span class="you-pill">You</span>' : ''}</div>
        <div class="sc">${esc(x.roll_no || '')}${x.exams_taken ? ` · ${x.exams_taken} tests` : x.max_marks ? ` · ${x.score}/${x.max_marks}` : ''}</div></div>
      <span class="score-badge" style="border-color:${pctColor(x.percentage)};color:${pctColor(x.percentage)};font-size:11px;padding:4px 9px;">${x.percentage}%</span>
    </div>`;
  }).join('');

  return `${podiumHtml}<div class="card" style="padding:4px 14px;margin-top:${podiumHtml ? '16px' : '0'};">${rows}</div>`;
}

/* ---------------------------------------------- MENTOR: STUDENT DETAIL -- */

SCREENS.studentDetail = () => {
  const o = state.data.overview;
  const tabs = ['Overview', 'Topics', 'History', 'Context'];
  const latest = o.history.exams[o.history.exams.length - 1];

  return `
  <div class="section" style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
    <div class="stamp lg">${initials(o.student.name)}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-family:'Fraunces';font-weight:600;font-size:16px;">${esc(o.student.name)}</div>
      <div class="test-sub" style="margin-bottom:0;">Student ID ${esc(o.student.roll_no || '—')}</div></div>
    <span class="score-badge lg">${o.history.summary.average_pct}<span class="pct">% avg</span></span>
  </div>
  <div class="uline-tabs">${tabs.map((t) => `<button class="t ${t === state.studentTab ? 'active' : ''}" onclick="setTab('studentTab','${t}')">${t}</button>`).join('')}</div>
  ${studentBody(o, latest)}`;
};

function studentBody(o, latest) {
  const s = o.history.summary;

  if (state.studentTab === 'Overview') {
    return `
    <div class="section">
      <div class="mini-stats">
        <div class="mini-stat"><div class="n" style="color:var(--teal);">${s.average_pct}%</div><div class="l">AVERAGE</div></div>
        <div class="mini-stat"><div class="n">${s.best_pct}%</div><div class="l">BEST</div></div>
        <div class="mini-stat"><div class="n">${s.exams_taken}</div><div class="l">TESTS</div></div>
        <div class="mini-stat"><div class="n" style="color:${s.overall_change >= 0 ? 'var(--teal)' : 'var(--coral)'};">
          ${s.overall_change > 0 ? '+' : ''}${s.overall_change}</div><div class="l">CHANGE</div></div>
      </div>
    </div>
    <div class="section"><div class="banner ${s.verdict === 'Improving' ? 'info' : 'warn'}">
      <b>${esc(s.verdict)}.</b> ${latest ? `Latest: ${esc(latest.title)} — ${latest.percentage}%${latest.delta !== null ? ` (${latest.delta > 0 ? '+' : ''}${latest.delta} on the previous test)` : ''}.` : ''}
    </div></div>
    ${o.strong_topics.length ? `<div class="section"><div class="section-title">Strong areas</div>
      <div class="card" style="padding:16px;">${o.strong_topics.map((t) => bar(t.topic, t.accuracy, 'var(--teal)')).join('')}</div></div>` : ''}
    ${o.weak_topics.length ? `<div class="section"><div class="section-title">Weak areas</div>
      <div class="card" style="padding:16px;">${o.weak_topics.map((t) => bar(t.topic, t.accuracy, 'var(--coral)')).join('')}</div></div>` : ''}
    <div class="section"><button class="btn full" onclick="openRecommendation(${o.student.id})">+ Add Recommendation</button></div>
    <div class="section"><button class="btn ghost full" onclick="go('recHistory',{selectedStudentId:${o.student.id}})">
      Recommendation history (${o.recommendations.length})</button></div>`;
  }

  if (state.studentTab === 'Topics') {
    if (!o.topics.length) return `<div class="section"><div class="card empty"><b>No topic data</b>This student has not submitted a test yet.</div></div>`;
    return `<div class="section"><div class="card" style="padding:16px;">
      ${o.topics.map((t) => bar(`${t.topic} (${t.correct}/${t.total})`, t.accuracy, bandColor(t.band))).join('')}
    </div></div>`;
  }

  if (state.studentTab === 'History') {
    const ex = o.history.exams;
    if (!ex.length) return `<div class="section"><div class="card empty"><b>No exams yet</b>Nothing to compare.</div></div>`;
    return `
    <div class="section"><div class="card chart-card">
      <div class="section-title">Score trend</div>
      ${sparkline(ex.map((e) => e.percentage), ex.map((_, i) => 'T' + (i + 1)))}
    </div></div>
    <div class="section"><div class="section-title">Test by test</div>
      <div class="card" style="padding:4px 16px;">
        ${ex.map((e) => `<div class="student-row" style="cursor:pointer;" onclick="go('sReport',{selectedAttemptId:${e.attempt_id}})">
          <div class="info"><div class="nm">${esc(e.title)}</div>
            <div class="sc">${fmtDate(e.scheduled_at)} · ${e.score}/${e.max_marks} · rank ${e.rank || '—'}</div></div>
          <div style="text-align:right;">
            <span class="score-badge" style="border-color:${pctColor(e.percentage)};color:${pctColor(e.percentage)};font-size:11px;padding:4px 9px;">${e.percentage}%</span>
            ${e.delta !== null ? `<div class="delta ${e.direction}" style="margin-top:4px;">
              ${e.direction === 'up' ? '▲' : e.direction === 'down' ? '▼' : '—'} ${Math.abs(e.delta)}</div>` : ''}
          </div></div>`).join('')}
      </div></div>`;
  }

  // Context — attendance and assignments alongside the exam record.
  const a = o.attendance;
  const g = o.assignments;
  return `
  <div class="section"><div class="section-title">Attendance</div>
    <div class="card" style="padding:16px;">
      ${bar('Sessions attended', a.attendance_pct, pctColor(a.attendance_pct))}
      ${bar('Exam average', s.average_pct, pctColor(s.average_pct))}
      <div class="auth-hint" style="padding:0;margin-top:10px;">${esc(a.correlation_note)}
        <br>${a.present_days} of ${a.total_days} sessions attended.</div>
    </div></div>
  <div class="section"><div class="section-title">Assignments</div>
    <div class="card" style="padding:16px;">
      ${bar('Assignment average', g.average_pct, pctColor(g.average_pct))}
      <div class="auth-hint" style="padding:0;margin-top:2px;">
        ${g.submitted} of ${g.total} submitted${g.missed ? ` · ${g.missed} missed` : ''}.</div>
      <div style="margin-top:12px;">
        ${g.items.map((it) => `<div class="summary-row"><span class="k">${esc(it.title)}</span>
          <span class="v" style="color:${it.submitted ? 'var(--ink)' : 'var(--coral)'};">
          ${it.submitted ? `${it.marks}/${it.max_marks}` : 'Not submitted'}</span></div>`).join('')}
      </div>
    </div></div>`;
}

/* -------------------------------------------- MENTOR: RECOMMENDATIONS --- */

function openRecommendation(id) {
  const o = state.data.overview;
  state.currentRec = {
    feedback: '',
    // Pre-filled from the analysis, so the admin edits a starting point
    // rather than retyping what the system already worked out.
    strengths: o ? o.strong_topics.map((t) => t.topic).slice(0, 3) : [],
    improve: o ? o.weak_topics.map((t) => t.topic).slice(0, 3) : [],
    recommendation: '',
  };
  go('recommendation', { selectedStudentId: id });
}

SCREENS.recommendation = () => {
  const o = state.data.overview;
  const plan = o.weak_topics.length
    ? `Revise ${o.weak_topics.map((t) => t.topic).slice(0, 2).join(' and ')}, then sit a short revision test to confirm the gap has closed.`
    : 'Hold this standard — move on to harder problems under timed conditions.';

  return `
  <div class="section" style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
    <div class="stamp" style="width:44px;height:44px;font-size:14px;">${initials(o.student.name)}</div>
    <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${esc(o.student.name)}</div>
      <div class="test-sub" style="margin-bottom:0;">Student ID ${esc(o.student.roll_no || '—')}</div></div>
    <span class="score-badge" style="font-size:11.5px;padding:5px 10px;">${o.history.summary.average_pct}%</span>
  </div>
  <div class="section">
    <span class="field-label">Overall feedback</span>
    <textarea class="field" rows="3" placeholder="How is this student doing?"
      oninput="state.currentRec.feedback=this.value">${esc(state.currentRec.feedback)}</textarea>
  </div>
  <div class="section">
    <span class="field-label">Strengths</span>
    <div id="chips-strengths">${chips('strengths')}</div>
    <div class="chip-add-row"><input id="in-strengths" placeholder="Add a strength…"
      onkeydown="if(event.key==='Enter')addChip('strengths')"><button class="chip-add-btn" onclick="addChip('strengths')">+</button></div>
  </div>
  <div class="section">
    <span class="field-label">Areas to improve</span>
    <div id="chips-improve">${chips('improve')}</div>
    <div class="chip-add-row"><input id="in-improve" placeholder="Add an area…"
      onkeydown="if(event.key==='Enter')addChip('improve')"><button class="chip-add-btn" onclick="addChip('improve')">+</button></div>
  </div>
  <div class="section">
    <span class="field-label">What to do next</span>
    <textarea class="field" rows="3" placeholder="${esc(plan)}"
      oninput="state.currentRec.recommendation=this.value">${esc(state.currentRec.recommendation)}</textarea>
    <div class="auth-hint" style="padding:0 2px;">Suggested: ${esc(plan)}
      <span style="color:var(--teal);cursor:pointer;font-weight:700;" onclick="useSuggested('${esc(plan).replace(/'/g, "\\'")}')"> Use this</span></div>
  </div>
  <div class="section"><button class="btn full" onclick="saveRecommendation()">Save Recommendation</button></div>`;
};

function useSuggested(text) {
  state.currentRec.recommendation = text;
  render();
}

function chips(type) {
  const cls = type === 'strengths' ? 'good' : 'bad';
  const list = state.currentRec[type];
  if (!list.length) return `<span style="font-size:11px;color:var(--ink-faint);">None added yet.</span>`;
  return list.map((c, i) => `<span class="chip ${cls}">${esc(c)} <span onclick="removeChip('${type}',${i})">✕</span></span>`).join('');
}
function addChip(type) {
  const el = document.getElementById('in-' + type);
  const v = el.value.trim();
  if (!v) return;
  state.currentRec[type].push(v);
  el.value = '';
  document.getElementById('chips-' + type).innerHTML = chips(type);
}
function removeChip(type, i) {
  state.currentRec[type].splice(i, 1);
  document.getElementById('chips-' + type).innerHTML = chips(type);
}

async function saveRecommendation() {
  const r = state.currentRec;
  if (!r.feedback.trim() && !r.recommendation.trim()) { showToast('Write some feedback first'); return; }
  try {
    await API.post(`/students/${state.selectedStudentId}/recommendations`, r);
    showToast('Recommendation saved');
    await go('recHistory', { selectedStudentId: state.selectedStudentId });
  } catch (err) { showToast(err.message); }
}

SCREENS.recHistory = () => {
  const recs = state.data.recs;
  if (!recs.length) {
    return `<div class="section"><div class="card empty"><b>No recommendations yet</b>
      Open a student and write the first one.</div></div>`;
  }
  return `<div class="section"><div class="card">
    ${recs.map((r) => `<div class="rec-item">
      <div class="rdate"><span>${fmtDate(r.created_at)}</span><span>${esc(r.mentor_name)}</span></div>
      ${r.student_name ? `<div style="font-size:11px;font-weight:700;color:var(--teal);margin-bottom:4px;">${esc(r.student_name)}</div>` : ''}
      ${r.feedback ? `<div class="rbody">${esc(r.feedback)}</div>` : ''}
      ${r.strengths.length ? `<div class="rtag">Strengths: ${esc(r.strengths.join(', '))}</div>` : ''}
      ${r.improve.length ? `<div class="rtag">To improve: ${esc(r.improve.join(', '))}</div>` : ''}
      ${r.recommendation ? `<div class="rtag" style="color:var(--ink);">Plan: ${esc(r.recommendation)}</div>` : ''}
    </div>`).join('')}
  </div></div>`;
};

SCREENS.profile = () => {
  const s = state.data.stats;
  const u = API.user;
  return `
  <div class="section" style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
    <div class="stamp lg">${initials(u.name)}</div>
    <div><div style="font-family:'Fraunces';font-weight:600;font-size:17px;">${esc(u.name)}</div>
      <div class="test-sub" style="margin-bottom:0;">${esc(u.department || '')} · ${esc(u.email)}</div></div>
  </div>
  <div class="section"><div class="stat-grid">
    ${statCard('Tests created', s.tests_total)}
    ${statCard('Tests conducted', s.tests_conducted)}
    ${statCard('Batch average', s.class_average_pct + '%', 'var(--teal)')}
    ${statCard('Pass percentage', s.pass_pct + '%', 'var(--teal)')}
  </div></div>
  <div class="section"><button class="btn ghost full" onclick="go('recHistory',{selectedStudentId:null})">All recommendations</button></div>
  <div class="section"><button class="btn ghost full" style="color:var(--coral);border-color:var(--coral-light);" onclick="logout()">Log out</button></div>`;
};
