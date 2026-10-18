/* ------------------------------------------------ MENTOR: TEST DETAIL --- */

SCREENS.testDetail = () => {
  const { exam, analytics } = state.data;
  const tabs = exam.proctoring
    ? ['Overview', 'Performance', 'Questions', 'Flags']
    : ['Overview', 'Performance', 'Questions'];
  return `
  <div class="section" style="margin-bottom:10px;">
    <div class="test-name" style="font-size:18px;">${esc(exam.title)}</div>
    <div class="test-sub">${esc(exam.batch_name)} · ${fmtDate(exam.scheduled_at)}, ${fmtTime(exam.scheduled_at)}</div>
  </div>
  ${exam.exam_code ? `<div class="section">
    <div class="code-box">
      <div class="lbl">Exam code</div><div class="val">${esc(exam.exam_code)}</div>
      <div class="sub">Students enter this to join · ${exam.duration_min} min · ${exam.total_marks} marks</div>
    </div>
  </div>` : `<div class="section">
    <div class="banner warn">This test is still a draft. Publish it to generate a code students can join with.</div>
    <button class="btn full" onclick="publishExam(${exam.id})">Publish Test</button>
  </div>`}
  <div class="uline-tabs">${tabs.map((t) => `<button class="t ${t === state.overviewTab ? 'active' : ''}" onclick="setTab('overviewTab','${t}')">${t}</button>`).join('')}</div>
  ${detailBody(exam, analytics)}`;
};

function detailBody(exam, an) {
  const appeared = an ? an.summary.appeared : 0;

  if (state.overviewTab === 'Overview') {
    if (!appeared) {
      return `<div class="section"><div class="card empty"><b>Not yet conducted</b>
        Results and analytics appear here once students have taken this test.</div></div>`;
    }
    const s = an.summary;
    return `
    <div class="section">
      <div class="stat-grid">
        ${statCard('Students appeared', `${s.appeared}<span style="font-size:13px;color:var(--ink-faint);">/${s.total_students}</span>`)}
        ${statCard('Batch average', s.class_average_pct + '%', 'var(--teal)')}
        ${statCard('Highest score', `${s.highest_score}<span style="font-size:13px;color:var(--ink-faint);">/${s.total_marks}</span>`)}
        ${statCard('Lowest score', `${s.lowest_score}<span style="font-size:13px;color:var(--ink-faint);">/${s.total_marks}</span>`)}
        ${statCard('Pass percentage', s.pass_pct + '%', 'var(--teal)')}
        ${statCard('Fail percentage', s.fail_pct + '%', 'var(--coral)')}
      </div>
    </div>
    ${distributionCard(an)}
    ${an.leaderboard.length ? `<div class="section">
      <div class="section-title">Results</div>
      <div class="card" style="padding:4px 14px;">
        ${an.leaderboard.map((r) => `<div class="student-row" onclick="go('studentDetail',{selectedStudentId:${r.student_id},studentTab:'Overview'})">
          <div class="rank-badge ${r.rank === 1 ? 'top' : ''}">${r.rank}</div>
          <div class="stamp" style="width:36px;height:36px;font-size:11px;">${initials(r.name)}</div>
          <div class="info"><div class="nm">${esc(r.name)}</div>
            <div class="sc">${esc(r.roll_no || '')} · ${r.score}/${r.max_marks}${r.passed === 0 ? ' · Failed' : ''}</div></div>
          <span class="score-badge" style="border-color:${pctColor(r.percentage)};color:${pctColor(r.percentage)};font-size:11px;padding:4px 9px;">${r.percentage}%</span>
        </div>`).join('')}
      </div>
    </div>` : ''}
    ${exam.questions.some((q) => q.type === 'descriptive') ? `<div class="section">
      <button class="btn ghost full" onclick="go('grading',{selectedExamId:${exam.id}})">Grade descriptive answers →</button>
    </div>` : ''}`;
  }

  if (state.overviewTab === 'Performance') {
    if (!appeared) return `<div class="section"><div class="card empty"><b>Nothing to analyse yet</b>Topic performance needs at least one submission.</div></div>`;
    const strong = an.topics.filter((t) => t.band === 'strong');
    const weak = an.topics.filter((t) => t.band !== 'strong');
    const worst = [...an.questions].filter((q) => q.attempts > 0).sort((a, b) => a.accuracy - b.accuracy).slice(0, 4);

    return `
    ${strong.length ? `<div class="section"><div class="section-title">Strong topics</div>
      <div class="card" style="padding:16px;">${strong.map((t) => bar(t.topic, t.accuracy, 'var(--teal)')).join('')}</div></div>` : ''}
    ${weak.length ? `<div class="section"><div class="section-title">Weak topics</div>
      <div class="card" style="padding:16px;">${weak.map((t) => bar(t.topic, t.accuracy, bandColor(t.band))).join('')}</div></div>` : ''}
    <div class="section"><div class="section-title">Most incorrect questions</div>
      <div class="card" style="padding:6px 16px;">
        ${worst.map((q) => `<div class="qitem"><div class="qi-text">Q${q.position + 1}. ${esc(q.text)}
          <div class="qi-marks">${esc(q.topic || '')} · ${q.correct}/${q.attempts} got this right · ${q.accuracy}%</div></div></div>`).join('')}
      </div></div>
    <div class="section"><div class="section-title">By question difficulty</div>
      <div class="card" style="padding:16px;">
        ${an.difficulty.map((d) => bar(
          d.difficulty[0].toUpperCase() + d.difficulty.slice(1) + ` (${d.questions} Qs)`,
          d.accuracy, pctColor(d.accuracy))).join('')}
      </div>
      <div class="auth-hint" style="padding:0 2px;">Accuracy on questions you tagged at each level. A low figure on “easy” usually points at a gap earlier in the syllabus.</div>
    </div>`;
  }

  if (state.overviewTab === 'Flags') {
    const flags = state.data.violations || [];
    if (!flags.length) {
      return `<div class="section"><div class="card empty"><b>No violations recorded</b>
        Nobody left the exam tab during this paper.</div></div>`;
    }
    return `<div class="section">
      <div class="auth-hint" style="padding:0 2px 10px;">
        Proctoring records when a student leaves the exam surface. It cannot see the room,
        a second device, or another person — treat these as prompts to ask, not as proof.
      </div>
      <div class="card" style="padding:4px 16px;">
        ${flags.map((f) => `<div class="vio-row">
          <div class="vio-count">${f.violations}</div>
          <div class="stamp" style="width:34px;height:34px;font-size:10px;">${initials(f.name)}</div>
          <div style="flex:1;min-width:0;">
            <div class="nm" style="font-weight:700;font-size:12.5px;">${esc(f.name)}
              ${f.terminated ? '<span class="proctor-chip" style="margin-left:5px;">Terminated</span>' : ''}</div>
            <div class="vio-ev">${esc(f.roll_no || '')} · ${f.events.slice(0, 3).map((e) =>
              `${esc(e.label)} at ${fmtTime(e.occurred_at)}`).join(' · ')}${f.events.length > 3 ? ` · +${f.events.length - 3} more` : ''}</div>
          </div>
          <span class="score-badge" style="font-size:11px;padding:4px 9px;">${f.percentage}%</span>
        </div>`).join('')}
      </div></div>`;
  }

  // Questions tab
  return `<div class="section"><div class="card" style="padding:6px 16px;">
    ${exam.questions.map((q, i) => {
      const stat = an && an.questions.find((x) => x.question_id === q.id);
      return `<div class="qitem"><div class="qi-text">Q${i + 1}. ${esc(q.text)}
        <div class="qi-marks">${q.exam_marks} mark${q.exam_marks > 1 ? 's' : ''} · ${esc(q.type.toUpperCase())} · ${esc(q.topic || '—')} · ${esc(q.difficulty)}
        ${stat && stat.attempts ? ` · ${stat.accuracy}% correct` : ''}</div></div></div>`;
    }).join('')}
  </div></div>`;
}

function distributionCard(an) {
  const colors = ['var(--teal)', 'var(--gold)', 'var(--amber)', 'var(--burnt)', 'var(--coral)'];
  let acc = 0;
  const stops = an.distribution.map((d, i) => {
    const from = acc; acc += d.pct;
    return `${colors[i]} ${from}% ${acc}%`;
  }).join(', ');
  return `<div class="section"><div class="card">
    <div style="padding:16px 16px 4px;"><div class="section-title" style="margin-bottom:0;">Score distribution</div></div>
    <div class="donut-wrap">
      <div class="donut" style="background:conic-gradient(${stops});">
        <div class="donut-center"><div class="n">${an.summary.appeared}</div><div class="l">Appeared</div></div></div>
      <div class="legend">
        ${an.distribution.map((d, i) => `<div class="legend-row">
          <span class="legend-dot" style="background:${colors[i]}"></span>${d.label} <b>${d.count}</b></div>`).join('')}
      </div>
    </div></div></div>`;
}

async function publishExam(id) {
  try {
    const res = await API.post(`/exams/${id}/publish`);
    showToast('Published — code ' + res.exam_code);
    await load();
  } catch (err) { showToast(err.message); }
}

/* ---------------------------------------------------- MENTOR: GRADING --- */

SCREENS.grading = () => {
  const { queue, exam } = state.data;
  if (!queue.length) {
    return `<div class="section"><div class="card empty"><b>Nothing left to grade</b>
      Every descriptive answer in ${esc(exam.title)} has been marked.</div></div>`;
  }
  return `
  <div class="section" style="margin-bottom:12px;">
    <div class="test-sub" style="margin-bottom:0;">${esc(exam.title)} · ${queue.length} answer${queue.length > 1 ? 's' : ''} awaiting marks</div>
  </div>
  <div class="section">
    ${queue.map((g) => `<div class="card grade-card">
      <div class="grade-who">
        <div class="stamp" style="width:34px;height:34px;font-size:10px;">${initials(g.student_name)}</div>
        <div><div class="nm">${esc(g.student_name)}</div><div class="rl">${esc(g.roll_no || '')}</div></div>
      </div>
      <div class="grade-q">Q${g.position + 1}. ${esc(g.text)}</div>
      <div class="grade-ans">${esc(g.answer || '(left blank)')}</div>
      ${g.model_answer ? `<div class="grade-model"><b>Marking note:</b> ${esc(g.model_answer)}</div>` : ''}
      <div class="mark-row">
        <input type="number" id="mark-${g.answer_id}" min="0" max="${g.max_marks}" step="0.5"
          value="${state.grading[g.answer_id] ?? ''}" placeholder="0"
          oninput="state.grading[${g.answer_id}]=this.value">
        <span class="of">/ ${g.max_marks} marks</span>
        <button class="btn sm" style="margin-left:auto;" onclick="gradeOne(${g.answer_id},${g.max_marks})">Save</button>
      </div>
    </div>`).join('')}
  </div>
  <div class="section"><button class="btn full" onclick="gradeAll()">Save all marks</button></div>`;
};

async function gradeOne(answerId, max) {
  const raw = document.getElementById('mark-' + answerId).value;
  const marks = Number(raw);
  if (raw === '' || Number.isNaN(marks)) { showToast('Enter a mark first'); return; }
  if (marks < 0 || marks > max) { showToast(`Marks must be between 0 and ${max}`); return; }
  try {
    await API.post('/attempts/grade', { grades: [{ answer_id: answerId, marks }] });
    delete state.grading[answerId];
    showToast('Marked');
    await load();
  } catch (err) { showToast(err.message); }
}

async function gradeAll() {
  const grades = Object.entries(state.grading)
    .filter(([, v]) => v !== '' && !Number.isNaN(Number(v)))
    .map(([answer_id, marks]) => ({ answer_id: Number(answer_id), marks: Number(marks) }));
  if (!grades.length) { showToast('Enter some marks first'); return; }
  try {
    const res = await API.post('/attempts/grade', { grades });
    state.grading = {};
    showToast(`Marked ${res.graded} answer${res.graded > 1 ? 's' : ''}`);
    await load();
  } catch (err) { showToast(err.message); }
}

/* ------------------------------------------------ MENTOR: CREATE TEST --- */

function openCreateTest() {
  state.createStep = 1;
  state.bankSelected = [];
  state.questionSource = 'new';
  state.draft = {
    batch_id: null, title: '', subject: '',
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    time: '10:00', duration_min: 60, passing_marks: '', question_type: 'mixed',
    instructions: 'Answer all questions. Your answers save automatically and the paper submits itself when the timer ends.',
    newQuestions: [],
    settings: { shuffle: false, show_result: true, negative_marking: false,
                proctoring: false, max_violations: 3 },
  };
  go('createTest');
}

SCREENS.createTest = () => {
  const steps = [{ n: 1, l: 'Details' }, { n: 2, l: 'Questions' }, { n: 3, l: 'Settings' }, { n: 4, l: 'Publish' }];
  const head = steps.map((st, i) => `<div class="wstep">
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div class="wcircle ${st.n < state.createStep ? 'done' : st.n === state.createStep ? 'active' : ''}">${st.n < state.createStep ? '✓' : st.n}</div>
      <div class="wlabel">${st.l}</div></div>
    ${i < steps.length - 1 ? `<div class="wline ${st.n < state.createStep ? 'done' : ''}"></div>` : ''}
  </div>`).join('');
  return `<div class="wizard-steps">${head}</div>${wizardBody()}`;
};

function wizardBody() {
  const d = state.draft;
  const { batches } = state.data;

  if (state.createStep === 1) {
    return `
    <div class="section"><span class="field-label">Test title</span>
      <input class="field" value="${esc(d.title)}" placeholder="e.g. Internal Assessment · Unit 1"
        oninput="state.draft.title=this.value"></div>
    <div class="section"><span class="field-label">Batch</span>
      <select class="field" onchange="state.draft.batch_id=Number(this.value)">
        <option value="">Choose a batch…</option>
        ${batches.map((b) => `<option value="${b.id}" ${d.batch_id === b.id ? 'selected' : ''}>${esc(b.name)} (${b.student_count})</option>`).join('')}
      </select></div>
    <div class="section"><span class="field-label">Subject</span>
      <input class="field" value="${esc(d.subject)}" placeholder="e.g. Machine Learning"
        oninput="state.draft.subject=this.value"></div>
    <div class="section"><div class="field-row">
      <div class="col"><span class="field-label">Date</span>
        <input class="field" type="date" value="${d.date}" oninput="state.draft.date=this.value"></div>
      <div class="col"><span class="field-label">Start time</span>
        <input class="field" type="time" value="${d.time}" oninput="state.draft.time=this.value"></div>
    </div></div>
    <div class="section"><div class="field-row">
      <div class="col"><span class="field-label">Duration</span>
        <select class="field" onchange="state.draft.duration_min=Number(this.value)">
          ${[30, 45, 60, 90, 120, 180].map((m) => `<option value="${m}" ${d.duration_min === m ? 'selected' : ''}>${m} minutes</option>`).join('')}
        </select></div>
      <div class="col"><span class="field-label">Passing marks</span>
        <input class="field" type="number" value="${d.passing_marks}" placeholder="Auto (33%)"
          oninput="state.draft.passing_marks=this.value"></div>
    </div></div>
    <div class="section"><span class="field-label">Instructions for students</span>
      <textarea class="field" rows="3" oninput="state.draft.instructions=this.value">${esc(d.instructions)}</textarea></div>
    <div class="section"><button class="btn full" onclick="wizardNext()">Next: Add questions →</button></div>`;
  }

  if (state.createStep === 2) {
    return `
    <div class="section">
      <div class="seg">
        <button class="${state.questionSource === 'new' ? 'on' : ''}" onclick="setSource('new')">✍ Write new</button>
        <button class="${state.questionSource === 'document' ? 'on' : ''}" onclick="setSource('document')">📄 Upload document</button>
      </div>
      ${state.questionSource === 'document' ? documentImportForm() : newQuestionForm()}
    </div>
    ${selectedList()}
    <div class="section" style="display:flex;gap:10px;">
      <button class="btn ghost" style="flex:1;justify-content:center;" onclick="wizardBack()">← Back</button>
      <button class="btn" style="flex:1;justify-content:center;" onclick="wizardNext()">Next: Settings →</button>
    </div>`;
  }

  if (state.createStep === 3) {
    const s = d.settings;
    return `
    <div class="section"><div class="card" style="padding:2px 16px;">
      ${toggleRow('shuffle', 'Shuffle questions', 'Each student gets the paper in a different order', s.shuffle)}
      ${toggleRow('show_result', 'Show result immediately', 'Students see their report the moment they submit', s.show_result)}
      ${toggleRow('negative_marking', 'Negative marking', 'Apply each question’s penalty to wrong answers', s.negative_marking)}
      ${toggleRow('proctoring', 'Proctoring', 'Record when a student leaves the exam tab', s.proctoring)}
    </div></div>
    ${s.proctoring ? `<div class="section">
      <span class="field-label">Submit the paper after</span>
      <select class="field" onchange="state.draft.settings.max_violations=Number(this.value)">
        <option value="1" ${s.max_violations === 1 ? 'selected' : ''}>1 violation — no warnings</option>
        <option value="2" ${s.max_violations === 2 ? 'selected' : ''}>2 violations — 1 warning</option>
        <option value="3" ${s.max_violations === 3 ? 'selected' : ''}>3 violations — 2 warnings</option>
        <option value="5" ${s.max_violations === 5 ? 'selected' : ''}>5 violations — 4 warnings</option>
      </select>
      <div class="auth-hint" style="padding:0 2px;">
        A notification popping up or an accidental Alt-Tab both register as violations.
        Allowing at least one warning is usually fairer than submitting on the first event.
      </div>
    </div>` : ''}
    <div class="section"><div class="auth-hint" style="padding:0 2px;">
      Unattempted questions never carry a penalty — only wrong answers do.
    </div></div>
    <div class="section" style="display:flex;gap:10px;">
      <button class="btn ghost" style="flex:1;justify-content:center;" onclick="wizardBack()">← Back</button>
      <button class="btn" style="flex:1;justify-content:center;" onclick="wizardNext()">Next: Publish →</button>
    </div>`;
  }

  const total = draftTotalMarks();
  const count = d.newQuestions.length;
  const batch = batches.find((b) => b.id === d.batch_id);
  return `
  <div class="section"><div class="card" style="padding:6px 16px;">
    ${row('Title', d.title || '—')}
    ${row('Batch', batch ? batch.name : '—')}
    ${row('Subject', d.subject)}
    ${row('Starts', `${fmtDate(d.date)}, ${d.time}`)}
    ${row('Duration', d.duration_min + ' minutes')}
    ${row('Questions', count)}
    ${row('Total marks', total)}
    ${row('Passing marks', d.passing_marks || Math.ceil(total * 0.4) + ' (auto)')}
    ${row('Shuffle', d.settings.shuffle ? 'On' : 'Off')}
    ${row('Instant results', d.settings.show_result ? 'On' : 'Off')}
    ${row('Negative marking', d.settings.negative_marking ? 'On' : 'Off')}
    ${row('Proctoring', d.settings.proctoring ? `On — submits after ${d.settings.max_violations}` : 'Off')}
  </div></div>
  <div class="section" style="display:flex;gap:10px;">
    <button class="btn ghost" style="flex:1;justify-content:center;" onclick="wizardBack()">← Back</button>
    <button class="btn" style="flex:1;justify-content:center;" onclick="publishDraft()">Publish Test</button>
  </div>`;
}

const row = (k, v) => `<div class="summary-row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;

function toggleRow(key, label, sub, on) {
  return `<div class="toggle-row"><div><div class="tl">${label}</div><div class="ts">${sub}</div></div>
    <div class="toggle ${on ? 'on' : ''}" onclick="toggleSetting('${key}')"><div class="knob"></div></div></div>`;
}
function toggleSetting(key) { state.draft.settings[key] = !state.draft.settings[key]; render(); }
function setSource(s) { state.questionSource = s; render(); }

function bankPicker(bank) {
  const f = state.bankFilter;
  const topics = [...new Set(bank.map((q) => q.topic).filter(Boolean))];
  const list = bank.filter((q) =>
    (!f.topic || q.topic === f.topic) && (!f.type || q.type === f.type));
  return `
  <div class="field-row" style="margin-bottom:10px;">
    <div class="col"><select class="field" onchange="setBankFilter('topic',this.value)">
      <option value="">All topics</option>
      ${topics.map((t) => `<option ${f.topic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="col"><select class="field" onchange="setBankFilter('type',this.value)">
      <option value="">All types</option>
      ${['mcq', 'msq', 'numeric', 'descriptive'].map((t) => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t.toUpperCase()}</option>`).join('')}</select></div>
  </div>
  <div class="card" style="padding:4px 16px;max-height:260px;overflow-y:auto;">
    ${list.length ? list.map((q) => {
      const on = state.bankSelected.includes(q.id);
      return `<div class="bank-item" onclick="toggleBank(${q.id})">
        <div class="bank-check ${on ? 'on' : ''}">${on ? '✓' : ''}</div>
        <div class="bank-text">${esc(q.text)}
          <div class="bank-meta">${esc(q.topic || '—')} · ${esc(q.type)} · ${q.marks} mark${q.marks > 1 ? 's' : ''} · ${esc(q.difficulty)}</div></div>
      </div>`;
    }).join('') : `<div class="empty">No questions match those filters.</div>`}
  </div>`;
}

function setBankFilter(k, v) { state.bankFilter[k] = v; render(); }
function toggleBank(id) {
  const i = state.bankSelected.indexOf(id);
  if (i >= 0) state.bankSelected.splice(i, 1); else state.bankSelected.push(id);
  render();
}

function setPicker(sets) {
  if (!sets.length) return `<div class="card empty">You have not saved any question sets yet.</div>`;
  return `<div class="card" style="padding:4px 16px;">
    ${sets.map((s) => `<div class="bank-item" onclick="addSet(${s.id})">
      <div class="bank-check">+</div>
      <div class="bank-text">${esc(s.name)}<div class="bank-meta">${esc(s.subject || '')} · ${s.question_count} questions</div></div>
    </div>`).join('')}</div>`;
}

async function addSet(id) {
  try {
    const set = await API.get('/questions/sets/' + id);
    set.questions.forEach((q) => { if (!state.bankSelected.includes(q.id)) state.bankSelected.push(q.id); });
    showToast(`Added ${set.questions.length} questions`);
    render();
  } catch (err) { showToast(err.message); }
}

function newQuestionForm() {
  return `
  <div style="margin-bottom:10px;"><span class="field-label">Question</span>
    <textarea class="field" id="nq-text" rows="2" placeholder="Type the question…"></textarea></div>
  <div class="field-row" style="margin-bottom:10px;">
    <div class="col"><span class="field-label">Type</span>
      <select class="field" id="nq-type" onchange="render()">
        <option value="mcq">Multiple choice</option><option value="descriptive">Descriptive</option>
      </select></div>
    <div class="col"><span class="field-label">Topic</span>
      <input class="field" id="nq-topic" placeholder="e.g. Arrays"></div>
  </div>
  <div id="nq-options" style="margin-bottom:10px;">
    <span class="field-label">Options — tap the circle to mark the correct one</span>
    ${[0, 1, 2, 3].map((i) => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:7px;">
      <div class="bank-check" id="nq-correct-${i}" onclick="setNewCorrect(${i})" style="border-radius:50%;cursor:pointer;"></div>
      <input class="field" id="nq-opt-${i}" placeholder="Option ${i + 1}" style="flex:1;"></div>`).join('')}
  </div>
  <div id="nq-model-answer" style="margin-bottom:10px;">
    <span class="field-label">Answer / marking guide</span>
    <textarea class="field" id="nq-answer" rows="2" placeholder="For descriptive questions, enter the expected answer…"></textarea>
  </div>
  <div class="field-row" style="margin-bottom:10px;">
    <div class="col"><span class="field-label">Marks</span>
      <select class="field" id="nq-marks">${[1, 2, 3, 4, 5].map((m) => `<option>${m}</option>`).join('')}</select></div>
    <div class="col"><span class="field-label">Difficulty</span>
      <select class="field" id="nq-diff"><option value="easy">Easy</option>
        <option value="medium" selected>Medium</option><option value="hard">Hard</option></select></div>
  </div>
  <button class="btn full" onclick="addNewQuestion()">+ Add this question</button>`;
}

let newCorrect = 0;
function setNewCorrect(i) {
  newCorrect = i;
  [0, 1, 2, 3].forEach((n) => {
    const el = document.getElementById('nq-correct-' + n);
    if (el) { el.classList.toggle('on', n === i); el.textContent = n === i ? '✓' : ''; }
  });
}

function addNewQuestion() {
  const text = document.getElementById('nq-text').value.trim();
  if (!text) { showToast('Write the question first'); return; }
  const type = document.getElementById('nq-type').value;
  const q = {
    text, type,
    topic: document.getElementById('nq-topic').value.trim() || null,
    marks: Number(document.getElementById('nq-marks').value),
    difficulty: document.getElementById('nq-diff').value,
    model_answer: type === 'descriptive' ? (document.getElementById('nq-answer')?.value.trim() || null) : null,
  };
  if (type === 'mcq') {
    q.options = [0, 1, 2, 3].map((i) => document.getElementById('nq-opt-' + i).value.trim()).filter(Boolean);
    if (q.options.length < 2) { showToast('Give at least two options'); return; }
    if (newCorrect >= q.options.length) { showToast('Mark which option is correct'); return; }
    q.correct_index = newCorrect;
  }
  state.draft.newQuestions.push(q);
  showToast('Question added');
  render();
}


function documentImportForm() {
  return `
  <div class="card" style="padding:18px;">
    <div style="font-weight:700;margin-bottom:6px;">Import questions from a document</div>
    <div class="auth-hint" style="padding:0 0 12px;">
      Upload a Word <b>.docx</b> or text <b>.txt</b> file that already contains questions and answers.
      No AI is used — the system only reads the Q/A structure and imports it.
    </div>
    <input class="field" id="question-document" type="file" accept=".docx,.txt">
    <div class="auth-hint" style="padding:10px 0 12px;">
      Example: <b>Q1. What is DBMS?</b> followed by <b>Answer: A system for managing databases.</b>.
      MCQs can use A), B), C), D) options and an Answer line.
    </div>
    <button class="btn full" onclick="importQuestionDocument()">Upload & Import Questions</button>
  </div>`;
}

async function importQuestionDocument() {
  const input = document.getElementById('question-document');
  const file = input?.files?.[0];
  if (!file) { showToast('Choose a DOCX or TXT file first'); return; }
  if (!state.draft.subject.trim()) { showToast('Enter the subject in Test Details first'); return; }

  const form = new FormData();
  form.append('file', file);
  form.append('subject', state.draft.subject.trim());

  try {
    const result = await API.upload('/questions/import-document', form);
    const imported = (result.questions || []).map((q) => ({ ...q, source: 'document' }));
    state.draft.newQuestions.push(...imported);
    state.questionSource = 'document';
    showToast(`Imported ${imported.length} question${imported.length === 1 ? '' : 's'}`);
    render();
  } catch (err) {
    showToast(err.message);
  }
}

function selectedList() {
  const total = state.draft.newQuestions.length;
  if (!total) return `<div class="section"><div class="card empty"><b>No questions added yet.</b> Write questions manually or upload a question-answer document.</div></div>`;

  return `<div class="section">
    <div class="section-title">On this paper <span style="color:var(--ink-soft);font-family:'Inter';font-size:11.5px;">${total} · ${draftTotalMarks()} marks</span></div>
    <div class="card" style="padding:4px 16px;">
      ${state.draft.newQuestions.map((q, i) => `<div class="qitem">
        <div class="reorder"><span style="font-size:12px;color:var(--ink-faint);">Q${i + 1}</span></div>
        <div class="qi-text">${esc(q.text)}
          <div class="qi-marks">${q.source === 'document' ? 'Imported · ' : ''}${esc(q.type)} · ${q.marks} mark${q.marks > 1 ? 's' : ''}</div></div>
        <div class="qi-remove" onclick="removeNewQ(${i})">✕</div></div>`).join('')}
    </div></div>`;
}

function moveQ(i, dir) {
  const arr = state.bankSelected;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  render();
}
function removeNewQ(i) { state.draft.newQuestions.splice(i, 1); render(); }

function draftTotalMarks() {
  return state.draft.newQuestions.reduce((s, q) => s + (Number(q.marks) || 0), 0);
}

function wizardNext() {
  const d = state.draft;
  if (state.createStep === 1) {
    if (!d.title.trim()) { showToast('Give the test a title'); return; }
    if (!d.batch_id) { showToast('Choose a batch'); return; }
  }
  if (state.createStep === 1 && !d.subject.trim()) { showToast('Enter the subject'); return; }
  if (state.createStep === 2 && d.newQuestions.length === 0) {
    showToast('Add at least one question'); return;
  }
  state.createStep += 1;
  render();
}
function wizardBack() { state.createStep -= 1; render(); }

// Creates and publishes in one action — the wizard's last step is "Publish
// Test", so a draft left behind would not match what the mentor was told.
async function publishDraft() {
  const d = state.draft;
  try {
    const exam = await API.post('/exams', {
      batch_id: d.batch_id,
      title: d.title,
      subject: d.subject,
      scheduled_at: new Date(`${d.date}T${d.time}`).toISOString(),
      duration_min: d.duration_min,
      passing_marks: d.passing_marks ? Number(d.passing_marks) : undefined,
      instructions: d.instructions,
      question_type: d.question_type,
      shuffle: d.settings.shuffle,
      show_result: d.settings.show_result,
      negative_marking: d.settings.negative_marking,
      proctoring: d.settings.proctoring,
      max_violations: d.settings.max_violations,
      question_ids: [],
      new_questions: d.newQuestions,
    });
    const pub = await API.post(`/exams/${exam.id}/publish`);
    showToast('Published — code ' + pub.exam_code);
    state.stack = [];
    await go('testDetail', { selectedExamId: exam.id, overviewTab: 'Overview' }, { push: false });
  } catch (err) { showToast(err.message); }
}
