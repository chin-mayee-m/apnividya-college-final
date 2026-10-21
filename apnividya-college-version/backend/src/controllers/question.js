const db = require('../config/db');
const mammoth = require('mammoth');

// Validates and normalises a question payload. Each type has a different notion
// of a correct answer, so the answer key is validated per type rather than with
// one blanket rule — a saved question that cannot be graded is worse than a
// rejected one.
function normalise(body) {
  const type = body.type || 'mcq';
  const base = {
    subject: body.subject,
    topic: body.topic || null,
    type,
    text: body.text,
    marks: Number(body.marks) || 1,
    negative_marks: Number(body.negative_marks) || 0,
    difficulty: ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : 'medium',
    options: null,
    correct_index: null,
    correct_indices: null,
    correct_number: null,
    tolerance: 0,
    model_answer: body.model_answer || null,
  };

  if (!base.subject) throw Object.assign(new Error('Subject is required'), { status: 400 });
  if (!base.text || !base.text.trim()) throw Object.assign(new Error('Question text is required'), { status: 400 });

  if (type === 'mcq' || type === 'msq') {
    const options = Array.isArray(body.options) ? body.options.filter((o) => String(o).trim()) : [];
    if (options.length < 2) {
      throw Object.assign(new Error('Give at least two options'), { status: 400 });
    }
    base.options = JSON.stringify(options);

    if (type === 'mcq') {
      const idx = Number(body.correct_index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
        throw Object.assign(new Error('Mark which option is correct'), { status: 400 });
      }
      base.correct_index = idx;
    } else {
      const idxs = Array.isArray(body.correct_indices) ? body.correct_indices.map(Number) : [];
      if (!idxs.length || idxs.some((i) => !Number.isInteger(i) || i < 0 || i >= options.length)) {
        throw Object.assign(new Error('Mark at least one correct option'), { status: 400 });
      }
      base.correct_indices = JSON.stringify([...new Set(idxs)].sort());
    }
  } else if (type === 'numeric') {
    const n = Number(body.correct_number);
    if (Number.isNaN(n)) {
      throw Object.assign(new Error('Give the correct numeric answer'), { status: 400 });
    }
    base.correct_number = n;
    base.tolerance = Math.abs(Number(body.tolerance) || 0);
  }
  // Descriptive questions carry no key — they route to the mentor for grading.

  return base;
}

async function list(req, res, next) {
  try {
    const filters = ['1=1'];
    const params = [];
    if (req.query.subject) { filters.push('subject = ?'); params.push(req.query.subject); }
    if (req.query.topic) { filters.push('topic = ?'); params.push(req.query.topic); }
    if (req.query.type) { filters.push('type = ?'); params.push(req.query.type); }
    if (req.query.difficulty) { filters.push('difficulty = ?'); params.push(req.query.difficulty); }
    if (req.query.q) { filters.push('text LIKE ?'); params.push(`%${req.query.q}%`); }

    const rows = (await db.query(
      `SELECT * FROM questions WHERE ${filters.join(' AND ')} ORDER BY id DESC LIMIT 300`,
      params
    )).rows;
    res.json(rows.map(hydrate));
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const q = normalise(req.body);
    const r = await db.query(
      `INSERT INTO questions
         (created_by, subject, topic, type, text, options, correct_index, correct_indices,
          correct_number, tolerance, model_answer, marks, negative_marks, difficulty)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, q.subject, q.topic, q.type, q.text, q.options, q.correct_index,
       q.correct_indices, q.correct_number, q.tolerance, q.model_answer,
       q.marks, q.negative_marks, q.difficulty]
    );
    res.status(201).json(hydrate((await db.query('SELECT * FROM questions WHERE id = ?', [r.lastInsertRowid])).rows[0]));
  } catch (err) { next(err); }
}

// Bulk create, used by the Create Exam wizard when a mentor types questions
// straight into the flow instead of picking from the bank.
async function bulkCreate(req, res, next) {
  try {
    const items = Array.isArray(req.body.questions) ? req.body.questions : [];
    if (!items.length) return res.status(400).json({ error: 'No questions supplied' });

    const created = await db.transaction(async () => {
      const ids = [];
      for (const item of items) {
        const q = normalise(item);
        const r = await db.query(
          `INSERT INTO questions
             (created_by, subject, topic, type, text, options, correct_index, correct_indices,
              correct_number, tolerance, model_answer, marks, negative_marks, difficulty)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [req.user.id, q.subject, q.topic, q.type, q.text, q.options, q.correct_index, q.correct_indices,
           q.correct_number, q.tolerance, q.model_answer, q.marks, q.negative_marks, q.difficulty]
        );
        ids.push(Number(r.lastInsertRowid));
      }
      return ids;
    });

    res.status(201).json({ ids: created, count: created.length });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const existing = (await db.query('SELECT * FROM questions WHERE id = ?', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Question not found' });
    const q = normalise({ ...hydrate(existing), ...req.body });
    await db.query(
      `UPDATE questions SET subject=?, topic=?, type=?, text=?, options=?, correct_index=?,
         correct_indices=?, correct_number=?, tolerance=?, model_answer=?, marks=?,
         negative_marks=?, difficulty=? WHERE id = ?`,
      [q.subject, q.topic, q.type, q.text, q.options, q.correct_index, q.correct_indices,
       q.correct_number, q.tolerance, q.model_answer, q.marks, q.negative_marks,
       q.difficulty, req.params.id]
    );
    res.json(hydrate((await db.query('SELECT * FROM questions WHERE id = ?', [req.params.id])).rows[0]));
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    // A question already used in an exam is kept, otherwise past results would
    // lose the text they were scored against.
    const used = (await db.query('SELECT 1 FROM exam_questions WHERE question_id = ?', [req.params.id])).rows[0];
    if (used) {
      return res.status(409).json({ error: 'This question is used in an exam and cannot be deleted' });
    }
    await db.query('DELETE FROM questions WHERE id = ?', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
}

async function topics(req, res, next) {
  try {
    const rows = (await db.query(
      `SELECT DISTINCT subject, topic FROM questions
        WHERE topic IS NOT NULL ORDER BY subject, topic`
    )).rows;
    res.json(rows);
  } catch (err) { next(err); }
}

// ---- Saved question sets --------------------------------------------------

async function listSets(req, res, next) {
  try {
    const rows = (await db.query(
      `SELECT s.*, (SELECT COUNT(*) FROM question_set_items i WHERE i.set_id = s.id) AS question_count
         FROM question_sets s WHERE s.created_by = ? ORDER BY s.created_at DESC`,
      [req.user.id]
    )).rows;
    res.json(rows);
  } catch (err) { next(err); }
}

async function createSet(req, res, next) {
  try {
    const { name, subject, question_ids } = req.body;
    if (!name) return res.status(400).json({ error: 'Set name is required' });
    const ids = Array.isArray(question_ids) ? question_ids : [];

    const setId = await db.transaction(async () => {
      const r = await db.query(
        'INSERT INTO question_sets (name, subject, created_by) VALUES (?,?,?)',
        [name, subject || null, req.user.id]
      );
      const id = Number(r.lastInsertRowid);
      for (let i = 0; i < ids.length; i += 1) {
        const qid = ids[i];
        await db.query(
          'INSERT OR IGNORE INTO question_set_items (set_id, question_id, position) VALUES (?,?,?)',
          [id, qid, i]
        );
      }
      return id;
    });

    res.status(201).json({ id: setId, name, question_count: ids.length });
  } catch (err) { next(err); }
}

async function getSet(req, res, next) {
  try {
    const set = (await db.query('SELECT * FROM question_sets WHERE id = ?', [req.params.id])).rows[0];
    if (!set) return res.status(404).json({ error: 'Question set not found' });
    const questions = (await db.query(
      `SELECT q.* FROM question_set_items i JOIN questions q ON q.id = i.question_id
        WHERE i.set_id = ? ORDER BY i.position`,
      [req.params.id]
    )).rows;
    res.json({ ...set, questions: questions.map(hydrate) });
  } catch (err) { next(err); }
}

function hydrate(q) {
  return {
    ...q,
    options: q.options ? JSON.parse(q.options) : null,
    correct_indices: q.correct_indices ? JSON.parse(q.correct_indices) : null,
  };
}


// Imports an existing question-answer document. No AI is used here: the
// document is parsed deterministically. Supported formats are DOCX and TXT.
// Expected patterns include:
//   Q1. Question text
//   Ans: Answer text
// and numbered questions with an "Answer:" line.
// MCQs are detected when A-D options are present and the answer identifies
// one of those options; otherwise the item is imported as descriptive.
async function importDocument(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Upload a DOCX or TXT question document' });
    const subject = String(req.body.subject || '').trim();
    if (!subject) return res.status(400).json({ error: 'Subject is required before importing questions' });

    const name = String(req.file.originalname || '').toLowerCase();
    let text = '';
    if (name.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value || '';
    } else if (name.endsWith('.txt')) {
      text = req.file.buffer.toString('utf8');
    } else {
      return res.status(400).json({ error: 'Only .docx and .txt files are supported' });
    }

    const questions = parseQuestionDocument(text, subject);
    if (!questions.length) {
      return res.status(400).json({
        error: 'No question-answer pairs found. Use formats such as "Q1. ...", "Answer: ..."',
      });
    }
    res.json({ count: questions.length, questions });
  } catch (err) { next(err); }
}

function parseQuestionDocument(text, subject) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
    .map((line) => line.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);

  const items = [];
  let current = null;
  let mode = null;

  const flush = () => {
    if (!current || !current.text || !current.answer) return;
    const options = current.options.map((o) => o.trim()).filter(Boolean);
    const answer = current.answer.trim();
    let type = 'descriptive';
    let correct_index = null;

    if (options.length >= 2) {
      const letter = answer.match(/^(?:option\s*)?([A-D])(?:[\).:\-]|\s|$)/i);
      if (letter) {
        const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
        if (idx < options.length) { type = 'mcq'; correct_index = idx; }
      } else {
        const idx = options.findIndex((o) => o.toLowerCase() === answer.toLowerCase());
        if (idx >= 0) { type = 'mcq'; correct_index = idx; }
      }
    }

    items.push({
      subject,
      topic: null,
      type,
      text: current.text.trim(),
      options: type === 'mcq' ? options : undefined,
      correct_index: type === 'mcq' ? correct_index : undefined,
      model_answer: type === 'descriptive' ? answer : null,
      marks: 1,
      difficulty: 'medium',
    });
    current = null;
    mode = null;
  };

  for (const line of lines) {
    const qmatch = line.match(/^(?:Q(?:uestion)?\s*)?(\d+)\s*[\).:\-]\s*(.+)$/i);
    const answerMatch = line.match(/^(?:Ans(?:wer)?|Correct\s*Answer)\s*[:\-]\s*(.+)$/i);
    const optionMatch = line.match(/^([A-D])\s*[\).:\-]\s*(.+)$/i);

    if (qmatch) {
      flush();
      current = { text: qmatch[2], answer: '', options: [] };
      mode = 'question';
      continue;
    }

    if (!current) continue;

    if (answerMatch) {
      current.answer = answerMatch[1];
      mode = 'answer';
      continue;
    }

    if (optionMatch) {
      current.options.push(optionMatch[2]);
      mode = 'options';
      continue;
    }

    if (mode === 'question') current.text += ' ' + line;
    else if (mode === 'answer') current.answer += ' ' + line;
  }
  flush();
  return items;
}

module.exports = {
  list, create, bulkCreate, update, remove, topics,
  listSets, createSet, getSet, hydrate, normalise, importDocument,
};
