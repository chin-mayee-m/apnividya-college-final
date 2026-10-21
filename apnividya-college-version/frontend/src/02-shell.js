/* ----------------------------------------------------------- LOADERS --- */

const LOADERS = {
  dashboard: async () => ({
    stats: await API.get('/analytics/dashboard'),
    exams: await API.get('/exams'),
  }),
  tests: async () => ({ exams: await API.get('/exams') }),
  batches: async () => ({ batches: await API.get('/batches') }),
  testDetail: async () => {
    const exam = await API.get('/exams/' + state.selectedExamId);
    let analytics = null;
    try { analytics = await API.get(`/exams/${state.selectedExamId}/analytics`); } catch { /* no attempts yet */ }
    const violations = exam.proctoring
      ? await API.get(`/exams/${state.selectedExamId}/violations`).catch(() => [])
      : [];
    return { exam, analytics, violations };
  },
  grading: async () => ({
    queue: await API.get(`/exams/${state.selectedExamId}/pending-grading`),
    exam: await API.get('/exams/' + state.selectedExamId),
  }),
  analytics: async () => ({
    stats: await API.get('/analytics/dashboard'),
    exams: await API.get('/exams'),
    topics: await API.get('/analytics/topics'),
  }),
  students: async () => ({
    students: await API.get('/students'),
    leaderboard: await API.get('/analytics/leaderboard?exam_id=' + state.leaderboardExam),
    exams: await API.get('/exams'),
  }),
  studentDetail: async () => ({ overview: await API.get(`/students/${state.selectedStudentId}/overview`) }),
  recommendation: async () => ({ overview: await API.get(`/students/${state.selectedStudentId}/overview`) }),
  recHistory: async () => ({
    recs: state.selectedStudentId
      ? await API.get(`/students/${state.selectedStudentId}/recommendations`)
      : await API.get('/analytics/recommendations'),
  }),
  profile: async () => ({ stats: await API.get('/analytics/dashboard') }),
  createTest: async () => ({
    batches: await API.get('/batches'),
  }),

  sDashboard: async () => ({
    exams: await API.get('/exams/mine'),
    perf: await API.get('/students/me/performance'),
  }),
  sExams: async () => ({ exams: await API.get('/exams/mine') }),
  sResults: async () => ({ exams: await API.get('/exams/mine') }),
  sReport: async () => ({ report: await API.get(`/attempts/${state.selectedAttemptId}/result`) }),
  sLeaderboard: async () => ({
    board: await API.get('/analytics/leaderboard?exam_id=' + state.leaderboardExam),
    exams: await API.get('/exams/mine'),
  }),
  sProfile: async () => ({ perf: await API.get('/students/me/performance') }),
  sJoin: async () => ({}),
  sBriefing: async () => ({ briefing: await API.get('/exams/code/' + state.joinCode) }),
};

/* ------------------------------------------------------------- SHELL --- */

function render() {
  document.querySelector('.notification-layer')?.remove();
  const app = document.getElementById('app');
  const shell = document.querySelector('.phone-screen');
  if (shell) shell.classList.remove('screen-login', 'screen-app', 'screen-player');

  if (!API.token || state.screen === 'login') {
    if (shell) shell.classList.add('screen-login');
    app.innerHTML = `<div class="scroll-area">${loginScreen()}</div>`;
    document.getElementById('header-area').innerHTML = '';
    document.getElementById('nav-area').innerHTML = '';
    return;
  }

  // The exam player takes over the whole frame: no bottom nav, no back
  // button. Leaving mid-paper should be a decision, not a stray tap.
  if (state.screen === 'sPlayer') {
    if (shell) shell.classList.add('screen-player');
    document.getElementById('header-area').innerHTML = '';
    document.getElementById('nav-area').innerHTML = '';
    app.innerHTML = playerScreen();
    return;
  }

  if (shell) shell.classList.add('screen-app');
  document.getElementById('header-area').innerHTML = getHeader();
  app.innerHTML = `<div class="scroll-area" id="scroll">${getContent()}</div>`;
  document.getElementById('nav-area').innerHTML = getNav();
}

function getNav() {
  const items = isAdmin()
    ? [
        { sec: 'dashboard', icon: ICONS.dash, label: 'Dashboard' },
        { sec: 'batches', icon: ICONS.grid, label: 'Batches' },
        { sec: 'tests', icon: ICONS.tests, label: 'Tests' },
        { sec: 'students', icon: ICONS.students, label: 'Students' },
        { sec: 'profile', icon: ICONS.profile, label: 'Profile' },
      ]
    : [
        { sec: 'sDashboard', icon: ICONS.dash, label: 'Dashboard' },
        { sec: 'sExams', icon: ICONS.tests, label: 'Exams' },
        { sec: 'sResults', icon: ICONS.analytics, label: 'Results' },
        { sec: 'sLeaderboard', icon: ICONS.trophy, label: 'Leaders' },
        { sec: 'sProfile', icon: ICONS.profile, label: 'Profile' },
      ];
  const active = sectionOf(state.screen);
  return `<div class="nav-items">${items.map((it) => `<button class="nav-item ${it.sec === active ? 'active' : ''}" onclick="goRoot('${it.sec}')">
    ${icon(it.icon, 19)}<span>${it.label}</span></button>`).join('')}</div>
  <div class="nav-profile" onclick="goRoot('${isAdmin() ? 'profile' : 'sProfile'}')">
    <div class="nav-avatar">${initials(API.user?.name || 'AV')}</div>
    <div class="nav-profile-copy"><b>${esc(API.user?.name || 'User')}</b><span>${isAdmin() ? 'Admin' : 'Student'}</span></div>
    <span class="nav-profile-arrow">›</span>
  </div>`;
}

function getNotifications() {
  const notes = [];
  const exams = state.data?.exams || [];
  const perf = state.data?.perf;

  const live = exams.filter((e) => e.live_status === 'Ongoing').slice(0, 2);
  live.forEach((e) => notes.push({
    id: `live-${e.id}`,
    type: 'live',
    title: 'Exam is live now',
    body: `${e.title} is available to attempt.`,
    action: () => startExam(e.id),
  }));

  const upcoming = exams.filter((e) => e.live_status === 'Upcoming').slice(0, 2);
  upcoming.forEach((e) => notes.push({
    id: `upcoming-${e.id}`,
    type: 'upcoming',
    title: 'Upcoming exam',
    body: `${e.title} · ${fmtDate(e.scheduled_at)} at ${fmtTime(e.scheduled_at)}.`,
    action: () => goRoot(isAdmin() ? 'tests' : 'sExams'),
  }));

  if (!isAdmin() && perf?.history?.exams?.length) {
    const latest = perf.history.exams[perf.history.exams.length - 1];
    notes.push({
      id: `result-${latest.attempt_id || latest.exam_id || latest.title}`,
      type: 'result',
      title: 'Latest result is ready',
      body: `${latest.title} · ${latest.percentage}% score.`,
      action: () => latest.attempt_id ? go('sReport', { selectedAttemptId: latest.attempt_id }) : goRoot('sResults'),
    });
  }

  if (!isAdmin() && perf?.weak_topics?.length) {
    const t = perf.weak_topics[0];
    notes.push({
      id: `topic-${t.topic}`,
      type: 'study',
      title: 'Study suggestion',
      body: `${t.topic} is currently at ${t.accuracy}%. A little extra practice could help.`,
      action: () => goRoot('sResults'),
    });
  }

  return notes;
}

function notificationUnreadCount() {
  const read = JSON.parse(localStorage.getItem('av_notification_read') || '[]');
  return getNotifications().filter((n) => !read.includes(n.id)).length;
}

function toggleNotifications(event) {
  event?.stopPropagation();
  const existing = document.querySelector('.notification-layer');
  if (existing) { existing.remove(); return; }

  const notes = getNotifications();
  const read = JSON.parse(localStorage.getItem('av_notification_read') || '[]');
  const panel = document.createElement('div');
  panel.className = 'notification-layer';
  panel.innerHTML = `<div class="notification-backdrop" onclick="closeNotifications(event)"></div>
    <div class="notification-panel" role="dialog" aria-label="Notifications">
      <div class="notification-head"><div><b>Notifications</b><span>${notes.length ? `${notes.length} updates` : 'You are all caught up'}</span></div>
        <button type="button" onclick="markNotificationsRead(event)">Mark all read</button></div>
      <div class="notification-list">
        ${notes.length ? notes.map((n) => `<button type="button" class="notification-item ${read.includes(n.id) ? '' : 'unread'}" onclick="handleNotification('${esc(n.id)}')">
          <span class="notification-icon ${n.type}">${n.type === 'live' ? '▶' : n.type === 'result' ? '✓' : n.type === 'study' ? '✦' : '◷'}</span>
          <span class="notification-copy"><b>${esc(n.title)}</b><small>${esc(n.body)}</small></span>
          ${read.includes(n.id) ? '' : '<i></i>'}
        </button>`).join('') : `<div class="notification-empty">No new notifications right now.</div>`}
      </div>
    </div>`;
  document.querySelector('.phone-screen')?.appendChild(panel);
}

function closeNotifications(event) {
  event?.stopPropagation();
  document.querySelector('.notification-layer')?.remove();
}

function handleNotification(id) {
  const notes = getNotifications();
  const n = notes.find((x) => x.id === id);
  const read = JSON.parse(localStorage.getItem('av_notification_read') || '[]');
  if (!read.includes(id)) read.push(id);
  localStorage.setItem('av_notification_read', JSON.stringify(read));
  document.querySelector('.notification-layer')?.remove();
  if (n?.action) n.action();
}

function markNotificationsRead(event) {
  event?.stopPropagation();
  const read = JSON.parse(localStorage.getItem('av_notification_read') || '[]');
  getNotifications().forEach((n) => { if (!read.includes(n.id)) read.push(n.id); });
  localStorage.setItem('av_notification_read', JSON.stringify(read));
  document.querySelector('.notification-layer')?.remove();
  render();
}

function getHeader() {
  const u = API.user;
  if (state.screen === 'dashboard' || state.screen === 'sDashboard') {
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,';
    const sub = isAdmin() ? esc(u.department || 'Faculty') : esc(u.department || ('Student ID · ' + (u.roll_no || '—')));
    return `<div class="app-header">
      <div><div class="greet-eyebrow">${greet}</div>
        <div class="greet-name">${esc(u.name.split(' ').slice(0, 2).join(' '))} 👋</div>
        <div class="greet-sub">${sub}</div></div>
      <div class="header-actions">
        <div class="desktop-search">${ICONS.search}<span>Search anything...</span><kbd>⌘ K</kbd></div>
        <button class="icon-btn header-bell" type="button" aria-label="Notifications" onclick="toggleNotifications(event)">${ICONS.bell}${notificationUnreadCount() ? `<div class="dot"></div>` : ''}${notificationUnreadCount() > 1 ? `<span class="notification-count">${Math.min(9, notificationUnreadCount())}</span>` : ''}</button>
        <div class="header-avatar">${initials(u.name)}</div>
      </div>
    </div>`;
  }

  const titles = {
    tests: 'All Tests', batches: 'Batches', analytics: 'Performance Analytics', students: 'Students Performance',
    profile: 'Profile', testDetail: 'Test Overview', createTest: 'Create New Test',
    grading: 'Grade Answers', studentDetail: 'Student Performance',
    recommendation: 'Add Recommendation', recHistory: 'Recommendations',
    sExams: 'My Exams', sResults: 'My Results', sLeaderboard: 'Leaderboard',
    sProfile: 'Profile', sReport: 'Exam Report', sJoin: 'Join an Exam', sBriefing: 'Exam Details',
  };
  const isRoot = currentRoots().includes(state.screen);
  return `<div class="app-header simple">
    ${isRoot ? '' : `<div class="icon-btn" onclick="headerBack()">${ICONS.back}</div>`}
    <div class="header-title">${titles[state.screen] || ''}</div>
  </div>`;
}

function getContent() {
  if (state.loading) return `<div class="loading">Loading…</div>`;
  if (state.error) {
    return `<div class="section"><div class="card empty"><b>Could not load this</b>${esc(state.error)}
      <div style="margin-top:14px;"><button class="btn sm" onclick="load()">Try again</button></div></div></div>`;
  }
  const fn = SCREENS[state.screen];
  return fn ? fn() : '';
}

/* -------------------------------------------------------------- AUTH --- */

function loginScreen() {
  const admin = state.authMode === 'admin';
  return `<div class="auth-wrap">
    <div>
      <div class="auth-mark">Apni Vidya</div>
      <div class="auth-tag">Smart examination and assessment. Conduct, evaluate, analyse, improve.</div>
    </div>
    <div class="auth-seg">
      <button class="${admin ? 'on' : ''}" onclick="setAuthMode('admin')">🛡️ Admin</button>
      <button class="${admin ? '' : 'on'}" onclick="setAuthMode('student')">🎓 Student</button>
    </div>
    ${state.authError ? `<div class="auth-err">${esc(state.authError)}</div>` : ''}
    <div style="margin-bottom:12px;">
      <span class="field-label">Email</span>
      <input class="field" id="login-email" type="email" autocomplete="username"
        value="${admin ? 'admin@apnividya.in' : 'student@apnividya.in'}">
    </div>
    <div style="margin-bottom:18px;">
      <span class="field-label">Password</span>
      <input class="field" id="login-pw" type="password" autocomplete="current-password"
        value="${admin ? 'mentor123' : 'student123'}"
        onkeydown="if(event.key==='Enter')doLogin()">
    </div>
    <button class="btn full" onclick="doLogin()">Sign in</button>
    <div class="auth-hint">
      <b>Demo accounts.</b> Admin: admin@apnividya.in / mentor123.<br>
      Student: student@apnividya.in / student123.
    </div>
  </div>`;
}

function setAuthMode(m) { state.authMode = m; state.authError = null; render(); }

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pw').value;
  if (!email || !password) { state.authError = 'Enter your email and password.'; render(); return; }

  try {
    const res = await API.post('/auth/login', { email, password });
    API.save(res.token, res.user);
    state.authError = null;
    state.stack = [];
    await go(res.user.role === 'admin' ? 'dashboard' : 'sDashboard', {}, { push: false });
  } catch (err) {
    state.authError = err.message;
    render();
  }
}

function logout() {
  if (state.ticker) clearInterval(state.ticker);
  API.clear();
  Object.assign(state, { screen: 'login', stack: [], data: {}, exam: null, answers: {} });
  render();
}

/* --------------------------------------------------- MENTOR: DASHBOARD -- */

const SCREENS = {};

SCREENS.dashboard = () => {
  const { stats, exams } = state.data;
  const needsGrading = exams.filter((e) => e.pending_grading > 0);
  const live = exams.filter((e) => e.live_status === 'Ongoing');
  const recent = [...exams].sort((a,b) => new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0)).slice(0, 4);
  const trend = stats.trend || [];

  return `
  <div class="dashboard-welcome-row">
    <div>
      <div class="page-kicker">Admin workspace</div>
      <h1>Overview</h1>
      <p>Create batches, conduct tests and monitor student performance from one place.</p>
    </div>
    <button class="btn primary-action" onclick="openCreateTest()">+ Create New Test</button>
  </div>

  ${live.length ? `<div class="section"><div class="banner info">● ${live.length} live test${live.length > 1 ? 's' : ''} running right now — ${esc(live[0].title)}.</div></div>` : ''}
  ${needsGrading.length ? `<div class="section"><div class="alert-card" onclick="go('grading',{selectedExamId:${needsGrading[0].id}})">
    <div class="alert-icon">!</div><div><b>Answers waiting for review</b><span>${needsGrading[0].pending_grading} descriptive answer${needsGrading[0].pending_grading > 1 ? 's' : ''} in ${esc(needsGrading[0].title)}</span></div><span class="alert-arrow">›</span>
  </div></div>` : ''}

  <div class="dashboard-stat-grid">
    <div class="dashboard-stat"><div class="stat-icon blue">${icon(ICONS.tests, 17)}</div><div><span>Tests conducted</span><strong>${stats.tests_conducted}</strong><small>+${Math.max(1, Math.round(stats.tests_conducted * .18))} this month</small></div></div>
    <div class="dashboard-stat"><div class="stat-icon purple">${icon(ICONS.students, 17)}</div><div><span>Students appeared</span><strong>${stats.students_appeared}</strong><small>Across all batches</small></div></div>
    <div class="dashboard-stat"><div class="stat-icon green">✓</div><div><span>Class average</span><strong>${stats.class_average_pct}%</strong><small>Overall performance</small></div></div>
    <div class="dashboard-stat"><div class="stat-icon orange">↗</div><div><span>Pass percentage</span><strong>${stats.pass_pct}%</strong><small>Students above threshold</small></div></div>
  </div>

  <div class="dashboard-main-grid">
    <div class="card dashboard-chart-card">
      <div class="dash-card-head"><div><b>Performance trend</b><span>Average class score across recent tests</span></div><button class="link-btn" onclick="goRoot('analytics')">View analytics →</button></div>
      ${trend.length > 1 ? sparkline(trend.map(t => t.average_pct), trend.map((_,i) => 'Test ' + (i+1))) : '<div class="chart-empty">Conduct more tests to see the performance trend.</div>'}
    </div>
    <div class="card dashboard-topics-card">
      <div class="dash-card-head"><div><b>Top performing topics</b><span>Current class strengths</span></div><button class="link-btn" onclick="goRoot('analytics')">View all →</button></div>
      ${(stats.strong_topics || stats.weak_topics || []).slice(0,4).map(t => bar(t.topic, t.accuracy, 'var(--blue)')).join('') || '<div class="chart-empty">Topic analysis will appear after submissions.</div>'}
    </div>
  </div>

  <div class="section dashboard-section">
    <div class="section-title"><span>Recent tests</span><button class="link" onclick="goRoot('tests')">View all →</button></div>
    <div class="card recent-tests-card">
      ${recent.length ? recent.map(e => `<div class="recent-test-row" onclick="go('testDetail',{selectedExamId:${e.id},overviewTab:'Overview'})">
        <div class="recent-test-icon">${icon(ICONS.tests,16)}</div><div class="recent-test-copy"><b>${esc(e.title)}</b><span>${esc(e.batch_name)} · ${esc(e.subject)}</span></div>
        <div class="recent-test-meta"><strong>${e.total_marks} marks</strong><span>${fmtDate(e.scheduled_at)}</span></div><span class="pill ${e.live_status.toLowerCase()}">${e.live_status}</span><span class="row-chevron">›</span>
      </div>`).join('') : '<div class="empty">No tests yet.</div>'}
    </div>
  </div>

  <div class="section dashboard-section">
    <div class="section-title"><span>Quick access</span></div>
    <div class="quick-grid">
      <div class="quick-item" onclick="goRoot('tests')">${icon(ICONS.tests, 19)}<span>All Tests</span></div>
      <div class="quick-item" onclick="goRoot('analytics')">${icon(ICONS.analytics, 19)}<span>Analytics</span></div>
      <div class="quick-item" onclick="goRoot('batches')">${icon(ICONS.grid, 19)}<span>Batches</span></div>
      <div class="quick-item" onclick="goRoot('students')">${icon(ICONS.students, 19)}<span>Students</span></div>
    </div>
  </div>`;
};

/* ------------------------------------------------------ MENTOR: TESTS --- */

SCREENS.tests = () => {
  const tabs = ['Upcoming', 'Ongoing', 'Past', 'Draft'];
  const list = state.data.exams.filter((e) => e.live_status === state.testsTab);
  return `
  <div class="uline-tabs">
    ${tabs.map((t) => `<button class="t ${t === state.testsTab ? 'active' : ''}" onclick="setTab('testsTab','${t}')">${t}</button>`).join('')}
  </div>
  <div class="section">
    ${list.length ? list.map(examCard).join('')
      : `<div class="card empty"><b>No ${state.testsTab.toLowerCase()} tests</b>
         ${state.testsTab === 'Draft' ? 'Drafts appear here until you publish them.' : 'Create a test to get started.'}
         <div style="margin-top:14px;"><button class="btn sm" onclick="openCreateTest()">+ Create Test</button></div></div>`}
  </div>`;
};

function examCard(e) {
  return `<div class="card test-card" onclick="go('testDetail',{selectedExamId:${e.id},overviewTab:'Overview'})">
    <div class="test-top">
      <div><div class="test-name">${esc(e.title)}</div><div class="test-sub">${esc(e.batch_name)} · ${esc(e.subject)}</div></div>
      <span class="pill ${e.live_status.toLowerCase()}">${e.live_status}</span>
    </div>
    <div class="meta-row"><div class="meta">📅 ${fmtDate(e.scheduled_at)}</div><div class="meta">🕐 ${fmtTime(e.scheduled_at)}</div></div>
    <div class="meta-row"><div class="meta">⏱ ${e.duration_min} min</div><div class="meta">✎ ${e.total_marks} marks</div>
      <div class="meta">◻ ${e.num_questions} Qs</div></div>
    ${e.exam_code ? `<div class="meta-row" style="margin-bottom:0;"><div class="meta" style="color:var(--teal);">
      🔑 ${esc(e.exam_code)}</div><div class="meta">👥 ${e.appeared}/${e.capacity} appeared</div></div>` : ''}
    ${e.pending_grading > 0 ? `<div style="margin-top:10px;"><span class="pill upcoming">${e.pending_grading} to grade</span></div>` : ''}
  </div>`;
}

function setTab(key, value) { state[key] = value; render(); }
