# Quick start

The seeded SQLite database is included. Install Node dependencies once for your machine, then start the app.

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:4000**.

> **If `npm start` fails with a `PostgreSQL` / `NODE_MODULE_VERSION` error**, the bundled binary was built for Linux + Node 22 and does not match your machine. One command fixes it:
> ```bash
> cd backend && npm rebuild PostgreSQL    # or: npm install
> ```

---

## Sign in

| Role | Email | Password |
|---|---|---|
| Admin | `admin@apnividya.in` | `admin123` |
| Junior College Student | `student@apnividya.in` | `student123` |
| Degree College Student | `degree.student@apnividya.in` | `student123` |

Use the JEE or NEET demo student credentials to view the corresponding batch and exams.

---

## Make sure an exam is live

The demo data is anchored to the moment it was built, so after a day or so nothing is currently running and there is no paper to sit. One command re-anchors every exam around right now, without losing the existing results or history:

```bash
cd backend && npm run refresh
```

It prints the code for the exam that is now live. To rebuild the demo data from scratch instead: `npm run reset`.

---

## A 5-minute walkthrough

**As the admin**

1. The dashboard flags anything waiting on you and shows where the class is losing marks.
2. **Tests → Past → college Mock.** *Overview* has the batch summary and score distribution. *Performance* has topic accuracy, the most-missed questions, and a difficulty breakdown.
3. Scroll down and hit **Grade descriptive answers**. Award marks — that student's total, pass/fail and rank all move.
4. **Students → any student → Context.** Attendance and assignment records sit alongside the exam record.
5. **Create Test.** Pick from the bank, load a saved set, or write questions inline; reorder them; publish. **Set the start time to now** so you can sit it straight away. Copy the code.

**As a student**

6. Log out, sign in as `jee2027001@apnividya.in`, then **Join Exam** and enter the code.
7. Sit the paper: answer, **Mark for review**, open the grid navigator, jump around. **Reload the tab mid-exam** — your answers and the clock come back exactly as you left them.
8. Submit, and read the report: rank, topic bands, what to improve, next steps, per-question review.

**To see proctoring**

9. The seeded **college Full Mock Test** is proctored with 3 strikes. Join it and, once the paper is open, switch to another browser tab for a few seconds. You get a warning naming the cause and the strikes remaining. Do it three times and the paper submits itself; the report explains why.
10. Back as the admin, open that test and pick the **Flags** tab — every student who left the exam, each event with a timestamp, and who was terminated.

Turning it on for your own test: wizard step 3 → **Proctoring**, then choose how many violations end the paper. Pick **1 violation — no warnings** for zero tolerance.

> Proctoring watches the exam tab, not the room. It catches a student switching away to look something up; it cannot see a second device or a person beside them, and it is not a substitute for supervision.

---

## Check it yourself

```bash
cd backend
npm test                        # 100 API checks across the whole journey
node scripts/proctor_test.js    # 38 API checks on proctoring
```

The UI suites drive a real browser. They need Playwright, which is not bundled:

```bash
npm install playwright && npx playwright install chromium
node scripts/ui_test.js                       # 79 checks, both journeys

# The proctoring UI suite must run windowed — headless Chromium reports every
# page as 'visible' and never blurs, so a tab switch cannot be simulated.
xvfb-run -a node scripts/proctor_ui_test.js   # 19 checks (Linux)
node scripts/proctor_ui_test.js               # macOS / Windows
```

All four were last run green from a clean install: **100 + 38 + 79 + 19 = 236 checks**.

---

`README.md` has the architecture notes, the full API reference, the design decisions, and the known limitations.


### Question document import
During Test Creation, use **Upload Document** to import an existing `.docx` or `.txt` question-answer file. No AI is used. The importer detects numbered questions, Answer lines, and A-D options.
