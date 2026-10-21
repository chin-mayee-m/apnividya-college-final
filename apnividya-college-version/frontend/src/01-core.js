/* =========================================================================
   Apni Vidya — Smart Examination & Assessment System
   Single-page client. Every screen reads from the API; there is no local
   fixture data. State holds only what the current screen is showing.
   ========================================================================= */

const ICONS = {
  back:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>',
  bell:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>',
  search:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  clock:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  grid:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  tests:'M9 11l3 3 8-8M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9',
  dash:'M3 10l9-7 9 7v9a2 2 0 01-2 2h-4a1 1 0 01-1-1v-5H9v5a1 1 0 01-1 1H5a2 2 0 01-2-2z',
  analytics:'M18 20V10M12 20V4M6 20v-6',
  students:'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z',
  profile:'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  trophy:'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z M7 5H5a2 2 0 00-2 2c0 2.2 1.8 4 4 4M17 5h2a2 2 0 012 2c0 2.2-1.8 4-4 4',
};
const icon = (p, s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="${p}"/></svg>`;

/* ---------------------------------------------------------------- API --- */

const API = {
  token: localStorage.getItem('av_token') || null,
  user: JSON.parse(localStorage.getItem('av_user') || 'null'),

  async call(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // An expired or tampered token drops the session rather than leaving the
    // app in a half-authenticated state showing stale screens.
    if (res.status === 401 && this.token) {
      this.clear();
      state.screen = 'login';
      render();
      throw new Error('Your session expired — sign in again');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status, data });
    return data;
  },

  get(p) { return this.call(p); },
  post(p, body) { return this.call(p, { method: 'POST', body }); },
  put(p, body) { return this.call(p, { method: 'PUT', body }); },
  patch(p, body) { return this.call(p, { method: 'PATCH', body }); },
  del(p) { return this.call(p, { method: 'DELETE' }); },

  async upload(p, formData) {
    const res = await fetch('/api' + p, {
      method: 'POST',
      headers: this.token ? { Authorization: 'Bearer ' + this.token } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Upload failed'), { status: res.status, data });
    return data;
  },

  save(token, user) {
    this.token = token; this.user = user;
    localStorage.setItem('av_token', token);
    localStorage.setItem('av_user', JSON.stringify(user));
  },
  clear() {
    this.token = null; this.user = null;
    localStorage.removeItem('av_token');
    localStorage.removeItem('av_user');
  },
};

/* -------------------------------------------------------------- STATE --- */

const state = {
  screen: 'login',
  stack: [],
  loading: false,
  error: null,
  data: {},           // whatever the current screen fetched

  authMode: 'admin',
  authError: null,

  testsTab: 'Upcoming',
  overviewTab: 'Overview',
  studentTab: 'Overview',
  recTab: 'All',
  examsTab: 'Ongoing',

  selectedExamId: null,
  selectedStudentId: null,
  selectedAttemptId: null,
  leaderboardExam: 'overall',
  searchQuery: '',

  // Create-exam wizard
  createStep: 1,
  draft: null,
  bankFilter: { subject: '', topic: '', type: '' },
  bankSelected: [],
  questionSource: 'new',

  // Live exam
  exam: null,          // { attempt, exam, questions }
  qIndex: 0,
  paletteOpen: false,
  answers: {},         // exam_question_id -> { answer, marked_for_review }
  secondsLeft: 0,
  ticker: null,
  questionEnteredAt: null,

  // Proctoring
  proctorWarning: null,   // { message, remaining } while the warning is shown
  proctorArmed: false,    // listeners attached only for a proctored paper

  grading: {},         // answer_id -> marks
  joinCode: '',
  currentRec: { feedback: '', strengths: [], improve: [], recommendation: '' },
};

const isAdmin = () => API.user && API.user.role === 'admin';

/* ------------------------------------------------------------ HELPERS --- */

// User-entered text goes through here before it reaches innerHTML. Question
// text, student names and mentor feedback are all free text, so escaping is
// not optional.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function clock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}
function mins(sec) {
  const m = Math.round((sec || 0) / 60);
  return m < 1 ? '<1m' : m + 'm';
}
const bandColor = (b) => b === 'strong' ? 'var(--teal)' : b === 'moderate' ? 'var(--amber)' : 'var(--coral)';
const pctColor = (p) => p >= 80 ? 'var(--teal)' : p >= 60 ? 'var(--gold)' : p >= 40 ? 'var(--amber)' : 'var(--coral)';

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => el.classList.remove('show'), 2400);
}

function bar(label, value, color, suffix = '%') {
  return `<div class="bar-row"><div class="top"><span>${esc(label)}</span><span>${value}${suffix}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, Math.min(100, value))}%;background:${color};"></div></div></div>`;
}

function statCard(label, value, color) {
  return `<div class="stat-card"><div class="stat-label" style="margin-bottom:8px;">${esc(label)}</div>
    <div class="stat-num"${color ? ` style="color:${color};"` : ''}>${value}</div></div>`;
}

// A line chart drawn straight from the trend data, rather than the fixed
// polyline the prototype used.
function sparkline(points, labels) {
  if (points.length < 2) {
    return `<div class="empty" style="padding:22px 8px;">Not enough exams yet to draw a trend.</div>`;
  }
  const W = 300, H = 100, pad = 20;
  const max = Math.max(100, ...points), min = Math.min(0, ...points);
  const x = (i) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const y = (v) => H - 12 - ((v - min) / (max - min || 1)) * (H - 30);
  const path = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
    <polygon points="${path} ${x(points.length - 1).toFixed(1)},${H - 6} ${pad},${H - 6}" fill="url(#fillg)"/>
    <defs><linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0E6E5C" stop-opacity="0.26"/><stop offset="100%" stop-color="#0E6E5C" stop-opacity="0"/>
    </linearGradient></defs>
    <polyline points="${path}" fill="none" stroke="#0E6E5C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === points.length - 1 ? 4.5 : 3.5}" fill="${i === points.length - 1 ? '#B8483C' : '#0E6E5C'}"/>`).join('')}
  </svg>
  <div class="chart-labels">${labels.map((l) => `<span>${esc(l)}</span>`).join('')}</div>`;
}

/* ----------------------------------------------------------- ROUTING --- */

const ROOTS_ADMIN = ['dashboard', 'batches', 'tests', 'students', 'profile'];
const ROOTS_STUDENT = ['sDashboard', 'sExams', 'sResults', 'sLeaderboard', 'sProfile'];
const currentRoots = () => (isAdmin() ? ROOTS_ADMIN : ROOTS_STUDENT);

function sectionOf(sc) {
  const map = {
    dashboard: 'dashboard', batches: 'batches', tests: 'tests', testDetail: 'tests', createTest: 'tests', grading: 'tests',
    analytics: 'analytics', students: 'students', studentDetail: 'students',
    recommendation: 'students', recHistory: 'students', profile: 'profile',
    sDashboard: 'sDashboard', sExams: 'sExams', sJoin: 'sExams', sBriefing: 'sExams', sPlayer: 'sExams',
    sResults: 'sResults', sReport: 'sResults', sLeaderboard: 'sLeaderboard', sProfile: 'sProfile',
  };
  return map[sc];
}

// Every navigation goes through go(): it sets the screen, runs that screen's
// loader, and re-renders. Screens therefore never fetch during render.
async function go(screen, extra = {}, { push = true } = {}) {
  if (push && state.screen !== screen) state.stack.push(state.screen);
  Object.assign(state, extra);
  state.screen = screen;
  state.error = null;
  await load();
}

async function goRoot(screen) {
  state.stack = [];
  await go(screen, {}, { push: false });
}

async function goBack() {
  const prev = state.stack.pop();
  state.screen = prev || (isAdmin() ? 'dashboard' : 'sDashboard');
  await load();
}

function headerBack() {
  if (state.screen === 'createTest' && state.createStep > 1) {
    state.createStep -= 1;
    render();
    return;
  }
  goBack();
}

// Loads whatever the current screen needs, then renders. A failure renders the
// message in place instead of leaving a blank screen.
async function load() {
  const loader = LOADERS[state.screen];
  if (!loader) { render(); return; }

  state.loading = true;
  state.data = {};
  render();

  try {
    state.data = (await loader()) || {};
    state.error = null;
  } catch (err) {
    state.error = err.message;
  } finally {
    state.loading = false;
    render();
  }
}
