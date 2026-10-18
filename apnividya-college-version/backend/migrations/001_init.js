// Core PostgreSQL schema for the Smart Examination & Assessment System.
module.exports = {
  name: '001_init',
  sql: `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','student')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  roll_no TEXT,
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS batches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS enrollments (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(batch_id, student_id)
);
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  created_by INTEGER REFERENCES users(id), subject TEXT NOT NULL, topic TEXT,
  type TEXT NOT NULL DEFAULT 'mcq' CHECK (type IN ('mcq','msq','numeric','descriptive')),
  text TEXT NOT NULL, options TEXT, correct_index INTEGER, correct_indices TEXT,
  correct_number REAL, tolerance REAL DEFAULT 0, model_answer TEXT,
  marks INTEGER NOT NULL DEFAULT 1, negative_marks REAL NOT NULL DEFAULT 0,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS question_sets (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, subject TEXT, created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS question_set_items (
  id SERIAL PRIMARY KEY, set_id INTEGER NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE, position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(set_id, question_id)
);
CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY, created_by INTEGER NOT NULL REFERENCES users(id),
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL, subject TEXT NOT NULL, scheduled_at TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60, total_marks INTEGER NOT NULL DEFAULT 0,
  passing_marks INTEGER NOT NULL DEFAULT 0, num_questions INTEGER NOT NULL DEFAULT 0,
  question_type TEXT DEFAULT 'mixed', instructions TEXT, exam_code TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  shuffle INTEGER NOT NULL DEFAULT 0, show_result INTEGER NOT NULL DEFAULT 1,
  negative_marking INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS exam_questions (
  id SERIAL PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, marks INTEGER NOT NULL DEFAULT 1, UNIQUE(exam_id, question_id)
);
CREATE TABLE IF NOT EXISTS attempts (
  id SERIAL PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, deadline_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ, auto_submitted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','evaluated')),
  score REAL DEFAULT 0, max_marks INTEGER DEFAULT 0, percentage REAL DEFAULT 0, rank INTEGER,
  passed INTEGER, time_taken_sec INTEGER DEFAULT 0, UNIQUE(exam_id, student_id)
);
CREATE TABLE IF NOT EXISTS attempt_answers (
  id SERIAL PRIMARY KEY, attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  exam_question_id INTEGER NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer TEXT, marked_for_review INTEGER NOT NULL DEFAULT 0, visited INTEGER NOT NULL DEFAULT 0,
  time_spent_sec INTEGER NOT NULL DEFAULT 0, is_correct INTEGER, marks_awarded REAL DEFAULT 0,
  needs_grading INTEGER NOT NULL DEFAULT 0, grader_comment TEXT, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attempt_id, exam_question_id)
);
CREATE TABLE IF NOT EXISTS recommendations (
  id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL REFERENCES users(id), exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL,
  feedback TEXT, strengths TEXT, improve TEXT, recommendation TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE, date TEXT NOT NULL,
  present INTEGER NOT NULL DEFAULT 1, UNIQUE(student_id, date)
);
CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY, batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL, subject TEXT, max_marks INTEGER NOT NULL DEFAULT 10, due_date TEXT
);
CREATE TABLE IF NOT EXISTS assignment_scores (
  id SERIAL PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, marks REAL NOT NULL DEFAULT 0,
  submitted INTEGER NOT NULL DEFAULT 1, UNIQUE(assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject, topic);
CREATE INDEX IF NOT EXISTS idx_exams_batch ON exams(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id, position);
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON attempts(exam_id, score);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id, status);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON attempt_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_student ON recommendations(student_id, created_at);
`
};
