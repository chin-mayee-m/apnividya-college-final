require('dotenv').config();
const db = require('../src/config/db');

// Re-anchors every exam's schedule relative to right now, keeping the same
// spread: the past tests stay past, one test becomes live, the rest stay
// upcoming. The demo data is seeded relative to the moment you seed it, so
// after a day or two nothing is live any more and there is no paper to sit.
// This fixes that without wiping the results, recommendations or history.


(async () => {
const OFFSETS_MIN = {
  'Data Structures — Unit Test 1': -21 * 1440,
  'Data Structures — Unit Test 2': -12 * 1440,
  'Data Structures — Mid Term': -4 * 1440,
  'Trees & Graphs — Practice Test': -5,      // live now
  'Hashing & Dynamic Programming': 3 * 1440,
  'Full Syllabus Revision Test': 10 * 1440,
};

const now = Date.now();
const exams = (await db.query('SELECT id, title, duration_min, scheduled_at FROM exams')).rows;

let moved = 0;
for (const e of exams) {
  const offset = OFFSETS_MIN[e.title];
  if (offset === undefined) continue;

  const scheduled = new Date(now + offset * 60000);
  await db.query("UPDATE exams SET scheduled_at = ?, updated_at = datetime('now') WHERE id = ?",
    [scheduled.toISOString(), e.id]);

  // Submitted attempts carry their own timestamps; drag them along so a
  // report never claims it was sat before the exam opened.
  const attempts = (await db.query(
    "SELECT id, time_taken_sec FROM attempts WHERE exam_id = ? AND status != 'in_progress'",
    [e.id]
  )).rows;
  for (const a of attempts) {
    const submitted = new Date(scheduled.getTime() + (a.time_taken_sec || 0) * 1000);
    await db.query(
      'UPDATE attempts SET started_at = ?, deadline_at = ?, submitted_at = ? WHERE id = ?',
      [
        scheduled.toISOString(),
        new Date(scheduled.getTime() + e.duration_min * 60000).toISOString(),
        submitted.toISOString(),
        a.id,
      ]
    );
  }

  // An attempt left in progress on the live exam gets a fresh clock, so it is
  // resumable rather than instantly expired.
  await db.query(
    `UPDATE attempts SET started_at = ?, deadline_at = ?
      WHERE exam_id = ? AND status = 'in_progress'`,
    [
      new Date(now).toISOString(),
      new Date(now + e.duration_min * 60000).toISOString(),
      e.id,
    ]
  );

  moved += 1;
}

const live = (await db.query(
  "SELECT title, exam_code FROM exams WHERE title = 'Trees & Graphs — Practice Test'"
)).rows[0];

console.log(`\n  Rescheduled ${moved} exams around ${new Date().toLocaleString()}.`);
if (live) console.log(`  Live now: "${live.title}" — code ${live.exam_code}\n`);
})().catch((err) => { console.error("[fatal] script failed:", err); process.exit(1); });
