// Verifies proctoring end to end in a real browser: the detection must fire on
// an actual tab switch, the warning must appear, and the third switch must
// terminate the paper.
const { chromium } = require('playwright');

const BASE = 'http://localhost:4000';
let pass = 0, fail = 0;
const ok = (l, c, d = '') => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + ' ' + d); } };

(async () => {
  // Headless Chromium reports every page as 'visible' and never blurs, so a tab
// switch cannot be simulated there. This runs windowed (use xvfb-run on a
// headless machine) so the switch is a real one.
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: `./shots/proctor-${n}.png` });

  // Mentor creates a proctored exam that is open now.
  const mentorToken = await (async () => {
    const r = await page.request.post(BASE + '/api/auth/login', {
      data: { email: 'mentor@apnividya.in', password: 'mentor123' },
    });
    return (await r.json()).token;
  })();

  const bank = await (await page.request.get(BASE + '/api/questions?type=mcq', {
    headers: { Authorization: 'Bearer ' + mentorToken },
  })).json();

  const exam = await (await page.request.post(BASE + '/api/exams', {
    headers: { Authorization: 'Bearer ' + mentorToken },
    data: {
      batch_id: 1, title: 'Proctor UI Test', subject: 'Data Structures',
      scheduled_at: new Date(Date.now() - 60000).toISOString(), duration_min: 60,
      question_ids: bank.slice(0, 4).map((q) => q.id),
      proctoring: true, max_violations: 3,
    },
  })).json();

  const pub = await (await page.request.post(BASE + `/api/exams/${exam.id}/publish`, {
    headers: { Authorization: 'Bearer ' + mentorToken },
  })).json();
  console.log(`\n  Proctored exam ready — code ${pub.exam_code}\n`);

  // Student signs in and opens the briefing.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Student")');
  await page.waitForTimeout(300);
  await page.fill('#login-email', 'cse2023006@apnividya.in');
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(1500);

  await page.click('.quick-item:has-text("Join Exam")');
  await page.waitForTimeout(700);
  await page.fill('#join-code', pub.exam_code);
  await page.click('button:has-text("Find exam")');
  await page.waitForTimeout(1500);

  let t = (await page.textContent('.phone-screen')).replace(/\s+/g, ' ');
  ok('briefing warns the paper is proctored', t.includes('proctored'));
  ok('briefing states the strike count', /3 event|3 strike/.test(t), t.match(/Proctored[^]{0,40}/)?.[0]);
  await shot('01-briefing');

  await page.click('button:has-text("Start Exam")');
  await page.waitForTimeout(1800);
  t = (await page.textContent('.phone-screen')).replace(/\s+/g, ' ');
  ok('exam opens', t.includes('Question 1 /'));
  ok('proctored badge shown during the exam', t.includes('Proctored'));
  await shot('02-player-badge');

  // A second tab genuinely backgrounds the first, which is what a student
  // switching away actually does — this is not a synthetic event.
  const other = await ctx.newPage();
  await other.goto('about:blank');

  // Stays away for longer than the client's 1.5s grace window, which exists so
  // that a momentary flick of focus is not treated as leaving the exam.
  const switchAway = async (ms = 2600) => {
    await other.bringToFront();
    await other.waitForTimeout(ms);
    await page.bringToFront();
    await page.waitForTimeout(1500);
  };

  await switchAway();
  t = (await page.textContent('.phone-screen')).replace(/\s+/g, ' ');
  ok('first tab switch triggers a warning', t.includes('Warning'), t.slice(0, 120));
  ok('warning names the cause', /Switched away|Left the exam/.test(t));
  ok('warning shows remaining strikes', /2 warnings remaining/.test(t), t.match(/\d+ warnings? remaining/)?.[0]);
  await shot('03-warning');

  await page.click('button:has-text("Return to my paper")');
  await page.waitForTimeout(600);
  t = (await page.textContent('.phone-screen')).replace(/\s+/g, ' ');
  ok('dismissing returns to the paper', t.includes('Question 1 /') && !t.includes('Warning'));

  // Throttling: a rapid second switch inside the window must not double-count.
  await page.waitForTimeout(2200);
  await switchAway();
  t = (await page.textContent('.phone-screen')).replace(/\s+/g, ' ');
  ok('second tab switch warns again', t.includes('Warning'));
  ok('strike count decrements, not jumps', /1 warning remaining/.test(t), t.match(/\d+ warnings? remaining/)?.[0]);
  await shot('04-warning-2');

  await page.click('button:has-text("Return to my paper")');
  await page.waitForTimeout(2200);

  // Third switch should end the paper.
  await switchAway();
  await page.waitForTimeout(2000);
  t = (await page.textContent('.phone-screen')).replace(/\s+/g, ' ');
  ok('third tab switch submits the paper', t.includes('submitted automatically'), t.slice(0, 150));
  ok('report explains it was proctoring, not the timer', /proctoring violation/.test(t));
  ok('terminated paper still shows a score', /SCORE|RANK/.test(t));
  await shot('05-terminated');

  await other.close();

  // Mentor sees the flag.
  await page.click('.nav-item:has-text("Profile")');
  await page.waitForTimeout(900);
  await page.click('button:has-text("Log out")');
  await page.waitForTimeout(600);
  await page.click('button:has-text("Mentor")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(1500);

  await page.click('.nav-item:has-text("Tests")');
  await page.waitForTimeout(1000);
  await page.click('.uline-tabs .t:has-text("Ongoing")');
  await page.waitForTimeout(500);
  const card = await page.$('.test-card:has-text("Proctor UI Test")');
  ok('proctored exam listed for the mentor', !!card);
  if (card) {
    await card.click();
    await page.waitForTimeout(1500);
    const flagsTab = await page.$('.uline-tabs .t:has-text("Flags")');
    ok('Flags tab appears for a proctored exam', !!flagsTab);
    if (flagsTab) {
      await flagsTab.click();
      await page.waitForTimeout(700);
      t = (await page.textContent('.phone-screen')).replace(/\s+/g, ' ');
      ok('flagged student listed', t.includes('Pooja') || /CSE2023006/i.test(t), t.slice(0, 160));
      ok('termination marked', t.includes('Terminated'));
      ok('individual events with timestamps shown', /(Switched away|Left the exam window) at \d/.test(t));
      ok('caveat about what proctoring cannot see is shown', t.includes('cannot see the room'));
      await shot('06-mentor-flags');
    }
  }

  console.log(`\n${'-'.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'-'.repeat(46)}\n`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('crashed', e); process.exit(1); });
