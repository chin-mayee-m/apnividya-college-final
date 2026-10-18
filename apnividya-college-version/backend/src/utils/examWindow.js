const db = require('./../config/db');

// Students are given a grace window after the scheduled end so a late joiner
// can still start, but their own clock is always clamped to the exam close.
const LATE_JOIN_GRACE_MIN = 0;

// Exam status is derived from the clock rather than stored, so an exam becomes
// "ongoing" on its own without a scheduler process. `status` in the database
// only tracks draft vs published — the authoring state, not the time state.
function windowFor(exam) {
  const start = new Date(exam.scheduled_at);
  const end = new Date(start.getTime() + exam.duration_min * 60000);
  return { start, end };
}

function liveStatus(exam, now = new Date()) {
  if (exam.status === 'draft') return 'Draft';
  const { start, end } = windowFor(exam);
  if (now < start) return 'Upcoming';
  if (now <= end) return 'Ongoing';
  return 'Past';
}

// Whether a student may begin an attempt right now.
function canStart(exam, now = new Date()) {
  if (exam.status !== 'published') return { ok: false, reason: 'This exam has not been published yet' };
  const { start, end } = windowFor(exam);
  if (now < start) {
    return { ok: false, reason: `This exam opens at ${start.toLocaleString()}` };
  }
  if (now > new Date(end.getTime() + LATE_JOIN_GRACE_MIN * 60000)) {
    return { ok: false, reason: 'This exam has closed' };
  }
  return { ok: true };
}

// An attempt's deadline is the earlier of (start + duration) and the exam's own
// close time, so joining ten minutes late costs those ten minutes rather than
// extending the exam past its window.
function deadlineFor(exam, startedAt = new Date()) {
  const personal = new Date(startedAt.getTime() + exam.duration_min * 60000);
  const { end } = windowFor(exam);
  return new Date(Math.min(personal.getTime(), end.getTime()));
}

// Human-friendly, unambiguous exam codes. I and O and the digits 1 and 0 are
// excluded because these get read aloud in a classroom and written on a board.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateExamCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

module.exports = { windowFor, liveStatus, canStart, deadlineFor, generateExamCode };
