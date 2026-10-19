const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

function sign(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function publicUser(u) {
  return {
    id: u.id, role: u.role, name: u.name, email: u.email,
    roll_no: u.roll_no, department: u.department,
  };
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = (await db.query('SELECT * FROM users WHERE email = ?', [String(email).toLowerCase()])).rows[0];
    // Same response for an unknown address and a wrong password, so the
    // endpoint cannot be used to enumerate who has an account.
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    res.json({ token: sign(user), user: publicUser(user) });
  } catch (err) { next(err); }
}

async function signup(req, res, next) {
  try {
    const { name, email, password, role, roll_no, department, batch_id } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const wanted = role === 'admin' ? 'admin' : 'student';

    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (role, name, email, password_hash, roll_no, department)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [wanted, name, String(email).toLowerCase(), hash, roll_no || null, department || null]
    );

    const user = (await db.query('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid])).rows[0];

    if (wanted === 'student' && batch_id) {
      await db.query('INSERT OR IGNORE INTO enrollments (batch_id, student_id) VALUES (?, ?)', [batch_id, user.id]);
    }

    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const user = (await db.query('SELECT * FROM users WHERE id = ?', [req.user.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const batches = (await db.query(
      `SELECT b.id, b.name FROM batches b
         JOIN enrollments e ON e.batch_id = b.id WHERE e.student_id = ?`,
      [user.id]
    )).rows;
    res.json({ user: publicUser(user), batches });
  } catch (err) { next(err); }
}

module.exports = { login, signup, me, publicUser };
