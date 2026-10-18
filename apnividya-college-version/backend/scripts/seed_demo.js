require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const migrate = require('../migrations/migrate');

// College-focused demo data. No JEE/NEET/coaching data is created.
// Run with --fresh only when you intentionally want to reset the database.
const FRESH = process.argv.includes('--fresh');

(async () => {
  if (FRESH) {
    await db.reset();
    console.log('Dropped existing PostgreSQL schema.');
  }

  await migrate();

  const hash = (pw) => bcrypt.hashSync(pw, 10);

  // Admin
  const adminId = Number((await db.query(
    `INSERT INTO users (role, name, email, password_hash, department)
     VALUES ('admin', ?, ?, ?, ?)`,
    ['College Admin', 'admin@apnividya.in', hash('mentor123'), 'Academic Administration']
  )).lastInsertRowid);

  // Sample college batches
  const batchRows = [];
  for (const name of ['SYJC Science A', 'TY CSE-DS A']) {
    const r = await db.query(
      'INSERT INTO batches (name, created_by) VALUES (?, ?)',
      [name, adminId]
    );
    batchRows.push({ id: Number(r.lastInsertRowid), name });
  }

  // Two generic demo students, one per sample batch.
  const demoStudents = [
    ['Aarav Sharma', 'JC-001', 'student@apnividya.in', 'Junior College', batchRows[0].id],
    ['Ananya Patil', 'DC-001', 'degree.student@apnividya.in', 'Degree College · CSE (Data Science)', batchRows[1].id],
  ];

  for (const [name, roll, email, department, batchId] of demoStudents) {
    const r = await db.query(
      `INSERT INTO users (role, name, email, password_hash, roll_no, department)
       VALUES ('student', ?, ?, ?, ?, ?)`,
      [name, roll, email, hash('student123'), roll, department]
    );
    await db.query(
      'INSERT INTO enrollments (batch_id, student_id) VALUES (?, ?)',
      [batchId, Number(r.lastInsertRowid)]
    );
  }

  console.log('College demo data seeded.');
  console.log('Admin: admin@apnividya.in / mentor123');
  console.log('Student: student@apnividya.in / student123');
  console.log('Sample batches: SYJC Science A, TY CSE-DS A');
  await db.raw.close();
})().catch(async (err) => {
  console.error('[fatal] seed failed:', err);
  try { await db.raw.close(); } catch {}
  process.exit(1);
});
