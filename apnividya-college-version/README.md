# Apni Vidya — Smart Examination & Assessment System

An online examination system for junior colleges and degree colleges. A admin creates a batch and test, publishes it as a code, students sit it in the browser, and both sides get an analysis that says what to do next.

The product line is **Conduct → Evaluate → Analyse → Improve**. The system does not stop at "Exam Result": every exam produces class-level insight for the admin and a concrete improvement path for the student.

---

## Running it

Node 18 or newer. No database server to install — the whole thing runs on a single SQLite file.

```bash
cd backend
npm install
npm run seed      # creates the schema and loads demo data
npm start         # http://localhost:4000
```

Open **http://localhost:4000**. The frontend is served by the same process, so there is no second server and no CORS setup.

To wipe everything and start over: `npm run reset`.

The demo data is anchored to the moment it was seeded, so after a day or two nothing is currently running and there is no paper to sit. `npm run refresh` re-anchors every exam around the present time — past tests stay past, one becomes live, the rest stay upcoming — without discarding the existing results, recommendations or history.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@apnividya.in` | `admin123` |
| Junior College Student | `student@apnividya.in` | `student123` |
| Degree College Student | `degree.student@apnividya.in` | `student123` |

Demo students are split across junior college and degree college batches. Sign in as the JEE or NEET demo student to see the respective exam journey.

The seed prints the exam codes it generated. One exam is always **live right now**, so you can sit a paper the moment the server starts.

### Suggested walkthrough

1. Sign in as the admin. The dashboard flags anything waiting to be graded.
2. **Tests → Past → college Mock.** Overview has the batch summary and score distribution; Performance has topic accuracy, the most-missed questions, and a difficulty breakdown.
3. **Grade descriptive answers** — award marks and watch that student's total and rank move.
4. **Students → any student → Context.** Attendance and assignment records sit next to the exam record.
5. **Create Test.** Pick from the bank, load a saved set, or write questions inline. Set the start time to *now* so you can sit it immediately. Publish, and copy the code.
6. Log out, sign in as a student, **Join Exam**, enter the code.
7. Sit the paper: answer, mark for review, jump around with the navigator, reload the tab mid-exam (your answers come back), then submit.
8. Read the report: rank, topic bands, what to improve, next steps, per-question review.

---

## Verifying it

Two test suites, both run against a live server.

```bash
# API — 100 checks across the whole journey
node scripts/smoke_test.js

# API — 38 checks on proctoring
node scripts/proctor_test.js

# UI — 79 checks driving a real browser through both journeys
cd .. && npm install playwright && node scripts/ui_test.js

# UI — 19 checks on proctoring. Must run windowed: headless Chromium reports
# every page as 'visible' and never blurs, so a tab switch cannot be simulated.
xvfb-run -a node scripts/proctor_ui_test.js     # on Linux
node scripts/proctor_ui_test.js                 # on macOS / Windows
```

**236 checks in total, all green from a clean install.**

The API suite covers auth and role boundaries, exam creation and publishing, joining by code, autosave, the server-side timer, auto-evaluation for every question type, descriptive grading, ranking, analytics, and the locking rules. It also asserts the negative cases: that a student cannot read the question bank, that no answer key reaches the exam screen, that a submitted paper cannot be reopened, and that an attempted exam cannot be edited or deleted.

---

## How it is built

```
backend/
  src/
    config/      db (SQLite wrapper), env validation, CORS
    middleware/  JWT auth, role gates, rate limits, error handler
    controllers/ auth, batch, question, exam, attempt, analytics, student, recommendation
    routes/      one module per resource
    utils/       evaluation, analytics, examWindow
  migrations/    schema + runner
  scripts/       seed_demo.js, smoke_test.js
  public/        built frontend (single file)
frontend/src/    frontend sources, assembled by scripts/build-frontend.js
```

The layout, the `db.query(sql, params) → { rows }` call shape, the `authenticate` / `authorize` middleware and the central error handler all follow the existing Apni Vidya 2.0 backend, so this drops into that codebase without a second set of conventions.

**The one deliberate difference is the database.** The reference platform runs on PostgreSQL; this service uses SQLite so the whole system starts from a clean checkout with no provisioning. `src/config/db.js` exposes the same interface the Postgres code uses, so moving back is a config change rather than a rewrite.

Rebuild the frontend after editing anything in `frontend/src/`:

```bash
node scripts/build-frontend.js
```

### Decisions worth knowing about

**The server owns the clock.** An attempt's `deadline_at` is written when it starts. The browser's countdown is cosmetic — it reconciles against the server every 15 seconds, and the server refuses any save past the deadline and closes the attempt out. Editing the client timer buys nothing. Joining ten minutes late costs those ten minutes rather than extending the exam past its window.

**Exam status is derived, not stored.** `status` tracks only draft vs published. Upcoming / Ongoing / Past is computed from `scheduled_at + duration_min` on read, so exams change state on their own without a scheduler process.

**One row per question per attempt, written at start.** Unattempted questions are real records rather than inferred absences, which is what makes the topic and pacing analytics plain SQL aggregates instead of reconstruction.

**Answer keys never reach the student.** Everything sent to the exam screen passes through a serialiser that strips `correct_index`, `correct_indices` and `correct_number`. The keys appear only in the report, after submission.

**Marks are snapshotted onto the exam.** `exam_questions.marks` is captured at creation, so editing a question in the bank later cannot retroactively change what a past exam was scored out of.

**Descriptive answers gate the result.** An attempt with answers still awaiting a human stays `submitted` with `passed = null`; it becomes `evaluated` only when every question carries a mark. Grading re-finalises the attempt and recomputes ranks, so a student's rank is never stale relative to their cohort. A descriptive answer counts as "correct" for topic analytics once it clears half marks — otherwise a 1/10 answer would read as mastery.

**Unattempted is not wrong.** Negative marking applies to wrong answers only. Skipping never costs marks, and totals are floored at zero.

**Proctoring counts strikes on the server.** The browser reports that a student left the exam surface; it does not get to decide how many warnings remain or when the paper ends. Reports are throttled to one per two seconds, because a single Alt-Tab fires both `blur` and `visibilitychange` on some browsers and burning three strikes on one action would be indefensible to the student. A `blur` is only counted after 1.5 seconds without focus — clicking the address bar, a password manager, or an OS notification all blur the window momentarily and none of them is cheating. Every event is written to `attempt_violations` with a timestamp, because when a terminated student disputes the result, "you switched tabs" is not an answer; the admin needs to see that the gap at 11:03 lasted forty seconds and decide for themselves.

**Attendance correlation is stated as observation, not causation.** With one class's data the honest reading is "attending regularly but scores lag — likely a comprehension gap, not an effort gap", not a correlation coefficient.

---

## API

All routes are under `/api`. Everything except `/auth/login` and `/auth/signup` needs `Authorization: Bearer <token>`.

### Auth
| Method | Path | |
|---|---|---|
| POST | `/auth/login` | returns token + user |
| POST | `/auth/signup` | |
| GET | `/auth/me` | current user and batches |

### Questions (admin only)
| Method | Path | |
|---|---|---|
| GET | `/questions` | filter by `subject`, `topic`, `type`, `difficulty`, `q` |
| POST | `/questions` · `/questions/bulk` | |
| PUT/DELETE | `/questions/:id` | delete refused if used in an exam |
| GET | `/questions/topics` | |
| GET/POST | `/questions/sets` · `/questions/sets/:id` | saved question sets |

### Exams
| Method | Path | |
|---|---|---|
| POST | `/exams` | bank ids, a saved set, and new questions in one call |
| GET | `/exams` | admin's exams, `?status=upcoming\|ongoing\|past\|draft` |
| GET | `/exams/:id` | full detail including the key |
| POST | `/exams/:id/publish` | mints the exam code and join link |
| PUT | `/exams/:id/questions` | reorder / re-mark; locked once attempted |
| DELETE | `/exams/:id` | locked once attempted |
| GET | `/exams/mine` | student's exams with their attempt state |
| GET | `/exams/code/:code` | pre-exam briefing, no questions |
| GET | `/exams/:id/analytics` | class analysis |
| GET | `/exams/:id/pending-grading` | grading queue |

### Attempts
| Method | Path | |
|---|---|---|
| POST | `/exams/:exam_id/start` | starts or resumes |
| PATCH | `/attempts/:id/answer` | autosave |
| GET | `/attempts/:id/status` | clock + progress |
| POST | `/attempts/:id/submit` | evaluates and returns the report |
| GET | `/attempts/:id/result` | full analysis |
| POST | `/attempts/grade` | admin awards descriptive marks |
| POST | `/attempts/:id/violation` | student client reports a proctoring event |
| GET | `/exams/:id/violations` | admin's violation log for an exam |

### Students & analytics
| Method | Path | |
|---|---|---|
| GET | `/students` | ranked list, `?q=` search |
| GET | `/students/:id/overview` | history, topics, attendance, assignments |
| GET | `/students/:id/history` | trend with per-exam deltas |
| GET | `/students/me/performance` | student's own view |
| GET/POST | `/students/:id/recommendations` | |
| GET | `/analytics/dashboard` · `/analytics/leaderboard` · `/analytics/topics` | |

---

## Known limitations

- **Inline event handlers.** The frontend uses `onclick` attributes carried over from the prototype, which requires `script-src-attr 'unsafe-inline'` in the CSP (see `src/server.js`). Fine for evaluation; a deployment should move to delegated listeners and drop it.
- **SQLite** suits a single instance. Multi-node deployment means switching `config/db.js` back to Postgres.
- **No file uploads.** Descriptive answers are typed, not scanned or handwritten.
- **Proctoring is browser-level only.** It sees the exam tab losing focus, not the room. A second device, a person beside the student, or a disabled-JavaScript client are all invisible to it. There is no webcam, screen recording, or OS lockdown.
- **One attempt per student per exam.** The schema supports retakes but the flow does not expose them.


## College-focused question import

Test creation supports two question-entry methods:
1. **Write New** — enter a question and its answer/options manually.
2. **Upload Document** — upload a `.docx` or `.txt` file that already contains question-answer pairs. The server parses the document deterministically; no AI/API is used.

Example:
```
Q1. What is DBMS?
Answer: A system for managing databases.

Q2. Which language is used for styling web pages?
A) HTML
B) CSS
C) SQL
D) Python
Answer: B
```
