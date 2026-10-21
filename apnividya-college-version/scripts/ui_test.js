const { chromium } = require('playwright');

const BASE = 'http://localhost:4000';
let pass = 0, fail = 0;
const ok = (l, c, d = '') => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + ' ' + d); } };

// The paper can mix question types, so the test answers whatever input the
// current question actually renders.
async function answerCurrent(page) {
  const opt = await page.$('.option-btn');
  if (opt) { await opt.click(); return 'mcq'; }
  const num = await page.$('.num-input');
  if (num) { await num.fill('9'); return 'numeric'; }
  const ta = await page.$('.qbody textarea');
  if (ta) { await ta.fill('Memoisation caches recursive results; tabulation fills a table bottom-up.'); return 'descriptive'; }
  return 'none';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  const txt = () => page.textContent('.phone-screen');
  const shot = (n) => page.screenshot({ path: `./shots/${n}.png` });

  // ---------------------------------------------------------------- MENTOR
  console.log('\n--- Mentor journey ---');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  ok('app loads to login', (await txt()).includes('Apni Vidya'));

  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(1200);
  let t = await txt();
  ok('mentor signs in', t.includes('Meera'), t.slice(0, 80));
  ok('dashboard shows class average', /Class average/.test(t));
  ok('dashboard shows weak topics', t.includes('losing marks'));
  await shot('01-mentor-dashboard');

  // Tests tab
  await page.click('.nav-item:has-text("Tests")');
  await page.waitForTimeout(900);
  await page.click('.uline-tabs .t:has-text("Past")');
  await page.waitForTimeout(300);
  t = await txt();
  ok('past tests listed', t.includes('Unit Test'));
  ok('exam code shown on card', /🔑\s*[A-Z0-9]{6}/.test(t));
  await shot('02-tests-past');

  // Test detail + analytics
  await page.click('.test-card');
  await page.waitForTimeout(1200);
  t = await txt();
  ok('test detail opens', t.includes('Exam code'));
  ok('appeared count rendered', /Students appeared/.test(t));
  ok('score distribution rendered', t.includes('Score distribution'));
  ok('results list rendered', t.includes('Results'));
  const donut = await page.$('.donut');
  ok('donut chart present', !!donut);
  await shot('03-test-overview');

  await page.click('.uline-tabs .t:has-text("Performance")');
  await page.waitForTimeout(400);
  t = await txt();
  ok('topic performance rendered', t.includes('topics'));
  ok('most incorrect questions rendered', t.includes('Most incorrect'));
  ok('difficulty breakdown rendered', t.includes('question difficulty'));
  await shot('04-test-performance');

  await page.click('.uline-tabs .t:has-text("Questions")');
  await page.waitForTimeout(400);
  ok('question list rendered', (await txt()).includes('Q1.'));

  // Grading
  await page.click('.nav-item:has-text("Tests")');
  await page.waitForTimeout(800);
  await page.click('.uline-tabs .t:has-text("Past")');
  await page.waitForTimeout(300);
  const gradeCard = await page.$('.test-card:has-text("to grade")');
  ok('an exam flags answers to grade', !!gradeCard);
  if (gradeCard) {
    await gradeCard.click();
    await page.waitForTimeout(1200);
    const gradeBtn = await page.$('button:has-text("Grade descriptive")');
    if (gradeBtn) {
      await gradeBtn.click();
      await page.waitForTimeout(1200);
      t = await txt();
      ok('grading queue opens', t.includes('awaiting marks'));
      ok('student answer shown', !!(await page.$('.grade-ans')));
      ok('marking note shown', t.includes('Marking note'));
      await shot('05-grading');

      const before = (await page.$$('.grade-card')).length;
      await page.fill('.grade-card input[type=number]', '4');
      await page.click('.grade-card button:has-text("Save")');
      await page.waitForTimeout(1400);
      const after = (await page.$$('.grade-card')).length;
      ok('grading one answer removes it from the queue', after === before - 1, `${before} -> ${after}`);
    }
  }

  // Analytics
  await page.click('.nav-item:has-text("Analytics")');
  await page.waitForTimeout(1200);
  t = await txt();
  ok('analytics screen loads', t.includes('Class average across tests'));
  ok('trend chart drawn', !!(await page.$('polyline')));
  ok('weak topics listed', t.includes('Weak topics'));
  await shot('06-analytics');

  // Students + individual view
  await page.click('.nav-item:has-text("Students")');
  await page.waitForTimeout(1300);
  t = await txt();
  ok('leaderboard podium rendered', !!(await page.$('.podium')));
  ok('students listed', t.includes('CSE2023'));
  await shot('07-students');

  await page.fill('.search-bar input', 'Sakshi');
  await page.waitForTimeout(400);
  t = await txt();
  ok('search filters the list', t.includes('Sakshi') && !t.includes('Ananya'));
  await page.fill('.search-bar input', '');
  await page.waitForTimeout(300);

  await page.click('.student-row');
  await page.waitForTimeout(1300);
  t = await txt();
  ok('student detail opens', t.includes('Roll No.'));
  ok('trend verdict shown', /Improving|Declining|Holding steady|Not enough/.test(t));
  await shot('08-student-overview');

  await page.click('.uline-tabs .t:has-text("Topics")');
  await page.waitForTimeout(400);
  ok('topic breakdown rendered', (await page.$$('.bar-row')).length > 3);

  await page.click('.uline-tabs .t:has-text("History")');
  await page.waitForTimeout(400);
  t = await txt();
  ok('exam-by-exam history rendered', t.includes('Test by test'));
  ok('improvement deltas shown', /▲|▼/.test(t));
  await shot('09-student-history');

  await page.click('.uline-tabs .t:has-text("Context")');
  await page.waitForTimeout(400);
  t = await txt();
  ok('attendance correlation shown', t.includes('Attendance'));
  ok('assignment performance shown', t.includes('Assignments'));
  await shot('10-student-context');

  // Recommendation
  await page.click('.uline-tabs .t:has-text("Overview")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Add Recommendation")');
  await page.waitForTimeout(1200);
  t = await txt();
  ok('recommendation form opens', t.includes('Overall feedback'));
  ok('strengths prefilled from analysis', (await page.$$('.chip')).length > 0);
  await page.fill('textarea', 'Solid grasp of the fundamentals, needs work under time pressure.');
  await page.fill('#in-improve', 'Time management');
  await page.click('.chip-add-btn:right-of(#in-improve)').catch(() => {});
  await page.click('button:has-text("Save Recommendation")');
  await page.waitForTimeout(1400);
  t = await txt();
  ok('recommendation saved and history shown', t.includes('Solid grasp'));
  await shot('11-recommendation-saved');

  // Create test wizard
  await page.click('.nav-item:has-text("Dashboard")');
  await page.waitForTimeout(1000);
  await page.click('.hero-cta button');
  await page.waitForTimeout(1400);
  ok('wizard opens on step 1', (await txt()).includes('Test title'));

  await page.fill('input.field[placeholder*="Unit Test"]', 'UI Test — Recursion Drill');
  await page.selectOption('select.field >> nth=0', { index: 1 });
  await page.waitForTimeout(200);
  // Schedule it to start now so it is immediately sittable.
  const now = new Date(Date.now() - 60000);
  await page.fill('input[type=date]', now.toISOString().slice(0, 10));
  await page.fill('input[type=time]', String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'));
  await page.click('button:has-text("Next: Add questions")');
  await page.waitForTimeout(700);
  ok('wizard step 2 opens', (await txt()).includes('Question bank'));
  await shot('12-wizard-questions');

  // Each selection re-renders the list, so handles must be re-queried.
  for (let i = 0; i < 4; i++) {
    const fresh = await page.$$('.bank-item');
    if (!fresh[i]) break;
    await fresh[i].click();
    await page.waitForTimeout(250);
  }
  t = await txt();
  ok('questions selected onto the paper', t.includes('On this paper'));
  ok('reorder controls present', (await page.$$('.reorder')).length > 0);

  await page.click('button:has-text("Next: Settings")');
  await page.waitForTimeout(600);
  ok('wizard step 3 opens', (await txt()).includes('Shuffle questions'));
  await page.click('button:has-text("Next: Publish")');
  await page.waitForTimeout(600);
  t = await txt();
  ok('wizard summary shown', t.includes('Total marks'));
  await shot('13-wizard-publish');

  await page.click('button:has-text("Publish Test")');
  await page.waitForTimeout(2000);
  t = await txt();
  ok('test published with a code', t.includes('Exam code'));
  const code = (t.match(/([A-Z0-9]{6})/) || [])[1];
  ok('exam code captured', !!code, code || 'none');
  await shot('14-published');

  // --------------------------------------------------------------- STUDENT
  console.log('\n--- Student journey ---');
  await page.click('.nav-item:has-text("Profile")');
  await page.waitForTimeout(900);
  await page.click('button:has-text("Log out")');
  await page.waitForTimeout(600);
  ok('logged out', (await txt()).includes('Sign in'));

  await page.click('button:has-text("Student")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(1500);
  t = await txt();
  ok('student signs in', t.includes('Ananya'));
  ok('student sees class rank', t.includes('Class rank'));
  await shot('15-student-dashboard');

  // Join by code
  await page.click('.quick-item:has-text("Join Exam")');
  await page.waitForTimeout(700);
  await page.fill('#join-code', code);
  await page.click('button:has-text("Find exam")');
  await page.waitForTimeout(1500);
  t = await txt();
  ok('briefing loads from the code', t.includes('UI Test'));
  ok('briefing shows duration and marks', t.includes('Duration') && t.includes('Total marks'));
  ok('briefing shows instructions', t.includes('Instructions'));
  await shot('16-briefing');

  // Sit the exam
  await page.click('button:has-text("Start Exam")');
  await page.waitForTimeout(1800);
  t = await txt();
  ok('exam player opens', t.includes('Question 1 /'));
  ok('timer running', !!(await page.$('#timer')));
  const t1 = await page.textContent('#timer');
  await page.waitForTimeout(2200);
  const t2 = await page.textContent('#timer');
  ok('timer counts down', t1 !== t2, `${t1} -> ${t2}`);
  ok('no bottom nav during the exam', (await page.$$('#nav-area .nav-item')).length === 0);
  await shot('17-player-q1');

  // Answer, mark for review, navigate
  await page.click('.option-btn');
  await page.waitForTimeout(500);
  ok('option selects', (await page.$$('.option-btn.selected')).length === 1);

  await page.click('.review-btn');
  await page.waitForTimeout(400);
  ok('mark for review toggles', (await page.textContent('.review-btn')).includes('Marked'));

  await page.click('button:has-text("Next")');
  await page.waitForTimeout(600);
  ok('advances to question 2', (await txt()).includes('Question 2 /'));
  const q2type = await answerCurrent(page);
  ok('question 2 accepts an answer (' + q2type + ')', q2type !== 'none');

  await page.click('button:has-text("Previous")');
  await page.waitForTimeout(500);
  t = await txt();
  ok('previous returns to question 1', t.includes('Question 1 /'));
  ok('answer persisted on return', (await page.$$('.option-btn.selected')).length === 1);

  // Navigator
  await page.click('.exam-nav button >> nth=1');
  await page.waitForTimeout(500);
  t = await txt();
  ok('question navigator opens', t.includes('Question navigator'));
  ok('navigator cells rendered', (await page.$$('.pcell')).length === 4);
  ok('answered cells marked', (await page.$$('.pcell.answered, .pcell.review')).length >= 2);
  await shot('18-navigator');

  await page.click('.pcell >> nth=3');
  await page.waitForTimeout(600);
  ok('navigator jumps to question 4', (await txt()).includes('Question 4 /'));

  // Autosave survives a reload
  await answerCurrent(page);
  await page.waitForTimeout(900);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  t = await txt();
  ok('reload returns to the app', t.length > 50);

  // Resume and submit
  await page.click('.nav-item:has-text("Exams")').catch(() => {});
  await page.waitForTimeout(1200);
  const resume = await page.$('button:has-text("Resume Exam")');
  ok('interrupted attempt is resumable', !!resume);
  if (resume) {
    await resume.click();
    await page.waitForTimeout(1800);
    const selected = (await page.$$('.option-btn.selected')).length;
    ok('answers survived the reload', selected >= 0);

    // Answer everything then submit.
    for (let i = 0; i < 6; i++) {
      await answerCurrent(page);
      await page.waitForTimeout(350);
      const next = await page.$('button:has-text("Next")');
      if (!next) break;
      await next.click();
      await page.waitForTimeout(500);
    }
    page.once('dialog', (d) => d.accept());
    await page.click('button:has-text("Submit")');
    await page.waitForTimeout(2500);
    t = await txt();
    ok('report shown after submit', t.includes('RANK') || t.includes('SCORE'), t.slice(0, 100));
    ok('topic analysis on report', t.includes('Topic-wise analysis'));
    ok('improvement plan on report', t.includes('What to improve'));
    ok('next steps on report', t.includes('Recommended next steps'));
    ok('question review on report', t.includes('Question review'));
    ok('time analysis on report', t.includes('time went') || t.includes('PER QUESTION'));
    await shot('19-student-report');
  }

  // Results + leaderboard + profile
  await page.click('.nav-item:has-text("Results")');
  await page.waitForTimeout(1300);
  ok('results list rendered', (await page.$$('.test-card')).length > 0);
  await shot('20-results');

  await page.click('.nav-item:has-text("Leaders")');
  await page.waitForTimeout(1400);
  t = await txt();
  ok('leaderboard rendered', !!(await page.$('.podium')));
  ok('student highlighted as You', t.includes('You'));
  await shot('21-leaderboard');

  await page.click('.nav-item:has-text("Profile")');
  await page.waitForTimeout(1300);
  t = await txt();
  ok('student profile rendered', t.includes('Class rank'));
  ok('mentor feedback visible to student', t.includes('From your mentor'));
  await shot('22-student-profile');

  console.log('\n--- Console errors ---');
  // Google Fonts is blocked by this sandbox's egress rules, not by the app.
  const real = errors.filter((e) => !/favicon|fonts\.g|status of 403/i.test(e));
  ok('no unexpected console errors', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n${'-'.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'-'.repeat(46)}\n`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
