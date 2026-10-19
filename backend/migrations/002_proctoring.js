module.exports = {
  name: '002_proctoring',
  sql: `
ALTER TABLE exams ADD COLUMN IF NOT EXISTS proctoring INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_violations INTEGER NOT NULL DEFAULT 3;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS violations INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS terminated_reason TEXT;
CREATE TABLE IF NOT EXISTS attempt_violations (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  type TEXT NOT NULL, detail TEXT, occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_violations_attempt ON attempt_violations(attempt_id, occurred_at);
`
};
