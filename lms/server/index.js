const path = require('path');
require('dotenv').config({ quiet: true });
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');
const razorpay = require('./razorpay');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(
  session({
    secret: 'vumca-hitech-lms-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use(express.static(path.join(__dirname, '..', 'public')));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function requireStudent(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.user.role !== 'student') return res.status(403).json({ error: 'Student access required' });
  next();
}

function requireFaculty(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.user.role !== 'faculty') return res.status(403).json({ error: 'Faculty access required' });
  next();
}

function requireParent(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.user.role !== 'parent') return res.status(403).json({ error: 'Parent access required' });
  next();
}

const publicUser = (row) => row && ({ id: row.id, role: row.role, username: row.username, name: row.name, email: row.email });

// ---------- Auth ----------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.user = publicUser(user);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: req.session.user });
});

// ---------- Admin: dashboard stats ----------
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const students = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'student'").get().c;
  const courses = db.prepare('SELECT COUNT(*) AS c FROM courses').get().c;
  const assignments = db.prepare('SELECT COUNT(*) AS c FROM assignments').get().c;
  const quizzes = db.prepare('SELECT COUNT(*) AS c FROM quizzes').get().c;
  const enrollments = db.prepare('SELECT COUNT(*) AS c FROM enrollments').get().c;
  const submissions = db.prepare('SELECT COUNT(*) AS c FROM submissions').get().c;
  const today = new Date().toISOString().slice(0, 10);
  const presentToday = db.prepare(
    "SELECT COUNT(*) AS c FROM attendance WHERE date = ? AND status = 'present'"
  ).get(today).c;
  res.json({ students, courses, assignments, quizzes, enrollments, submissions, presentToday });
});

// ---------- Admin: students ----------
app.get('/api/admin/students', requireAdmin, (req, res) => {
  const students = db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.mobile, u.fee_amount, u.fee_paid,
           (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id) AS course_count,
           (SELECT COUNT(*) FROM attendance a WHERE a.student_id = u.id AND a.status = 'present') AS present_days
    FROM users u WHERE u.role = 'student' ORDER BY u.name
  `).all();
  res.json(students);
});

app.post('/api/admin/students', requireAdmin, (req, res) => {
  const { username, password, name, email, mobile, fee_amount, fee_paid } = req.body || {};
  if (!username || !password || !name) return res.status(400).json({ error: 'Username, password and name are required' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (role, username, password_hash, name, email, mobile, fee_amount, fee_paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('student', username, hash, name, email || null, mobile || null,
        fee_amount != null ? Number(fee_amount) : 0,
        fee_paid ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/students/:id', requireAdmin, (req, res) => {
  const { name, email, mobile, fee_amount, fee_paid, password } = req.body || {};
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const fields = {
    name: name ?? student.name,
    email: email ?? student.email,
    mobile: mobile ?? student.mobile,
    fee_amount: fee_amount != null ? Number(fee_amount) : student.fee_amount,
    fee_paid: fee_paid != null ? (fee_paid ? 1 : 0) : student.fee_paid,
  };
  if (password) {
    db.prepare('UPDATE users SET name = ?, email = ?, mobile = ?, fee_amount = ?, fee_paid = ?, password_hash = ? WHERE id = ?')
      .run(fields.name, fields.email, fields.mobile, fields.fee_amount, fields.fee_paid, bcrypt.hashSync(password, 10), student.id);
  } else {
    db.prepare('UPDATE users SET name = ?, email = ?, mobile = ?, fee_amount = ?, fee_paid = ? WHERE id = ?')
      .run(fields.name, fields.email, fields.mobile, fields.fee_amount, fields.fee_paid, student.id);
  }
  res.json({ ok: true });
});

app.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Student not found' });
  res.json({ ok: true });
});

// ---------- Admin: courses ----------
app.get('/api/admin/courses', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignment_count,
      (SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id) AS quiz_count
    FROM courses c ORDER BY c.code
  `).all());
});

app.post('/api/admin/courses', requireAdmin, (req, res) => {
  const { code, title, description, instructor, weeks, level } = req.body || {};
  if (!code || !title) return res.status(400).json({ error: 'Course code and title are required' });
  if (db.prepare('SELECT id FROM courses WHERE code = ?').get(code)) {
    return res.status(409).json({ error: 'Course code already exists' });
  }
  const result = db.prepare(
    'INSERT INTO courses (code, title, description, instructor, weeks, level) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(code, title, description || '', instructor || '', weeks || 12, level || 'Beginner');
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/courses/:id', requireAdmin, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const { code, title, description, instructor, weeks, level } = req.body || {};
  db.prepare('UPDATE courses SET code = ?, title = ?, description = ?, instructor = ?, weeks = ?, level = ? WHERE id = ?')
    .run(code || course.code, title || course.title, description ?? course.description,
         instructor ?? course.instructor, weeks || course.weeks, level || course.level, course.id);
  res.json({ ok: true });
});

app.delete('/api/admin/courses/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Course not found' });
  res.json({ ok: true });
});

// ---------- Admin: enrollments ----------
app.get('/api/admin/enrollments', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT e.id, e.student_id, e.course_id, e.enrolled_at,
           u.username, u.name AS student_name, c.code AS course_code, c.title AS course_title
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    JOIN courses c ON c.id = e.course_id
    ORDER BY e.id DESC
  `).all());
});

app.post('/api/admin/enrollments', requireAdmin, (req, res) => {
  const { student_id, course_id } = req.body || {};
  if (!student_id || !course_id) return res.status(400).json({ error: 'Student and course are required' });
  try {
    const result = db.prepare('INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)')
      .run(student_id, course_id);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: 'Already enrolled' });
  }
});

app.delete('/api/admin/enrollments/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM enrollments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: assignments ----------
app.get('/api/admin/assignments', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT a.*, c.code AS course_code, c.title AS course_title,
      (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submitted_count,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = a.course_id) AS enrolled_count
    FROM assignments a JOIN courses c ON c.id = a.course_id ORDER BY a.due_date
  `).all());
});

app.post('/api/admin/assignments', requireAdmin, (req, res) => {
  const { course_id, title, description, due_date, max_score } = req.body || {};
  if (!course_id || !title) return res.status(400).json({ error: 'Course and title are required' });
  const result = db.prepare(
    'INSERT INTO assignments (course_id, title, description, due_date, max_score) VALUES (?, ?, ?, ?, ?)'
  ).run(course_id, title, description || '', due_date || null, max_score || 100);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/assignments/:id', requireAdmin, (req, res) => {
  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  const { title, description, due_date, max_score } = req.body || {};
  db.prepare('UPDATE assignments SET title = ?, description = ?, due_date = ?, max_score = ? WHERE id = ?')
    .run(title || assignment.title, description ?? assignment.description,
         due_date ?? assignment.due_date, max_score || assignment.max_score, assignment.id);
  res.json({ ok: true });
});

app.delete('/api/admin/assignments/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: assignments submissions ----------
app.get('/api/admin/assignments/:id/submissions', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT s.*, u.username, u.name AS student_name
    FROM submissions s JOIN users u ON u.id = s.student_id
    WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC
  `).all(req.params.id));
});

app.post('/api/admin/assignments/:id/submissions/:sid/grade', requireAdmin, (req, res) => {
  const { score } = req.body || {};
  if (score === undefined || score === null || isNaN(score)) {
    return res.status(400).json({ error: 'Score is required' });
  }
  db.prepare('UPDATE submissions SET score = ? WHERE id = ?').run(Number(score), req.params.sid);
  res.json({ ok: true });
});

// ---------- Admin: quizzes ----------
app.get('/api/admin/quizzes', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT q.*, c.code AS course_code, c.title AS course_title,
      (SELECT COUNT(*) FROM questions qu WHERE qu.quiz_id = q.id) AS question_count,
      (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id) AS attempt_count
    FROM quizzes q JOIN courses c ON c.id = q.course_id ORDER BY q.id DESC
  `).all());
});

app.get('/api/admin/quizzes/:id', requireAdmin, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  const questions = db.prepare('SELECT id, text, options, correct_index FROM questions WHERE quiz_id = ? ORDER BY id').all(quiz.id);
  res.json({ ...quiz, questions: questions.map(q => ({ ...q, options: JSON.parse(q.options) })) });
});

app.post('/api/admin/quizzes', requireAdmin, (req, res) => {
  const { course_id, title, description, time_limit, questions } = req.body || {};
  if (!course_id || !title) return res.status(400).json({ error: 'Course and title are required' });
  const result = db.prepare(
    'INSERT INTO quizzes (course_id, title, description, time_limit) VALUES (?, ?, ?, ?)'
  ).run(course_id, title, description || '', time_limit || 15);
  const quizId = result.lastInsertRowid;
  if (Array.isArray(questions)) {
    const stmt = db.prepare('INSERT INTO questions (quiz_id, text, options, correct_index) VALUES (?, ?, ?, ?)');
    for (const q of questions) {
      if (q.text && Array.isArray(q.options) && q.options.length >= 2) {
        stmt.run(quizId, q.text, JSON.stringify(q.options), Number(q.correct_index) || 0);
      }
    }
  }
  res.status(201).json({ id: quizId });
});

app.put('/api/admin/quizzes/:id', requireAdmin, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  const { title, description, time_limit, questions } = req.body || {};
  db.prepare('UPDATE quizzes SET title = ?, description = ?, time_limit = ? WHERE id = ?')
    .run(title || quiz.title, description ?? quiz.description, time_limit || quiz.time_limit, quiz.id);
  if (Array.isArray(questions)) {
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quiz.id);
    const stmt = db.prepare('INSERT INTO questions (quiz_id, text, options, correct_index) VALUES (?, ?, ?, ?)');
    for (const q of questions) {
      if (q.text && Array.isArray(q.options) && q.options.length >= 2) {
        stmt.run(quiz.id, q.text, JSON.stringify(q.options), Number(q.correct_index) || 0);
      }
    }
  }
  res.json({ ok: true });
});

app.delete('/api/admin/quizzes/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: AI quiz generation ----------
const { generateQuizQuestions, isConfigured: aiConfigured } = require('./ai');

app.get('/api/admin/ai/status', requireAdmin, (req, res) => {
  res.json({ configured: aiConfigured() });
});

app.post('/api/admin/quizzes/generate', requireAdmin, async (req, res) => {
  const { topic, count, difficulty } = req.body || {};
  if (!topic || !String(topic).trim()) return res.status(400).json({ error: 'A topic is required' });
  const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);
  try {
    const questions = await generateQuizQuestions(String(topic).trim(), n, String(difficulty || 'medium'));
    res.json({ questions });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------- Admin: reports ----------
const { builders } = require('./reports');
const notify = require('./notify');

app.get('/api/admin/reports/:type', requireAdmin, (req, res) => {
  const builder = builders[req.params.type];
  if (!builder) return res.status(404).json({ error: 'Unknown report type' });
  res.json(builder());
});

// ---------- Admin: attendance ----------
app.get('/api/admin/attendance', requireAdmin, (req, res) => {
  const dates = db.prepare('SELECT DISTINCT date FROM attendance ORDER BY date DESC').all().map(r => r.date);
  const records = db.prepare(`
    SELECT a.id, a.student_id, a.course_id, a.date, a.status,
           u.username, u.name AS student_name, c.code AS course_code, c.title AS course_title
    FROM attendance a
    JOIN users u ON u.id = a.student_id
    JOIN courses c ON c.id = a.course_id
    ORDER BY a.date DESC, u.name
  `).all();
  res.json({ dates, records });
});

app.post('/api/admin/attendance', requireAdmin, (req, res) => {
  const { student_id, course_id, date, status } = req.body || {};
  if (!student_id || !course_id || !date || !status) {
    return res.status(400).json({ error: 'Student, course, date and status are required' });
  }
  db.prepare(`
    INSERT INTO attendance (student_id, course_id, date, status) VALUES (?, ?, ?, ?)
    ON CONFLICT(student_id, course_id, date) DO UPDATE SET status = excluded.status
  `).run(student_id, course_id, date, status);
  res.json({ ok: true });
});

// ---------- Student: dashboard ----------
app.get('/api/student/courses', requireStudent, (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, e.enrolled_at,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignment_count,
      (SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id) AS quiz_count
    FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE e.student_id = ? ORDER BY c.code
  `).all(req.session.user.id));
});

app.get('/api/student/assignments', requireStudent, (req, res) => {
  res.json(db.prepare(`
    SELECT a.*, c.code AS course_code, c.title AS course_title,
      s.score, s.submitted_at AS submitted,
      (CASE WHEN s.id IS NULL THEN 0 ELSE 1 END) AS is_submitted
    FROM enrollments e
    JOIN assignments a ON a.course_id = e.course_id
    JOIN courses c ON c.id = a.course_id
    LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = e.student_id
    WHERE e.student_id = ? ORDER BY a.due_date
  `).all(req.session.user.id));
});

app.post('/api/student/assignments/:id/submit', requireStudent, (req, res) => {
  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  const enrolled = db.prepare(
    'SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?'
  ).get(req.session.user.id, assignment.course_id);
  if (!enrolled) return res.status(403).json({ error: 'Not enrolled in this course' });

  const { content } = req.body || {};
  db.prepare(`
    INSERT INTO submissions (assignment_id, student_id, content) VALUES (?, ?, ?)
    ON CONFLICT(assignment_id, student_id) DO UPDATE SET content = excluded.content, submitted_at = datetime('now'), score = NULL
  `).run(assignment.id, req.session.user.id, content || '');
  res.json({ ok: true });
});

app.get('/api/student/quizzes', requireStudent, (req, res) => {
  res.json(db.prepare(`
    SELECT q.*, c.code AS course_code, c.title AS course_title,
      (SELECT COUNT(*) FROM questions qu WHERE qu.quiz_id = q.id) AS question_count,
      (SELECT score FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.student_id = ? ORDER BY qa.id DESC LIMIT 1) AS last_score
    FROM enrollments e
    JOIN quizzes q ON q.course_id = e.course_id
    JOIN courses c ON c.id = q.course_id
    WHERE e.student_id = ? ORDER BY q.id DESC
  `).all(req.session.user.id, req.session.user.id));
});

app.get('/api/student/quizzes/:id', requireStudent, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  const enrolled = db.prepare(
    'SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?'
  ).get(req.session.user.id, quiz.course_id);
  if (!enrolled) return res.status(403).json({ error: 'Not enrolled in this course' });

  const questions = db.prepare('SELECT id, text, options FROM questions WHERE quiz_id = ? ORDER BY id').all(quiz.id);
  res.json({ ...quiz, questions: questions.map(q => ({ ...q, options: JSON.parse(q.options) })) });
});

app.post('/api/student/quizzes/:id/submit', requireStudent, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  const enrolled = db.prepare(
    'SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?'
  ).get(req.session.user.id, quiz.course_id);
  if (!enrolled) return res.status(403).json({ error: 'Not enrolled in this course' });

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY id').all(quiz.id);
  const answers = (req.body && req.body.answers) || {};
  let score = 0;
  for (const q of questions) {
    if (Number(answers[q.id]) === q.correct_index) score += 1;
  }
  const result = db.prepare(
    'INSERT INTO quiz_attempts (quiz_id, student_id, score, total) VALUES (?, ?, ?, ?)'
  ).run(quiz.id, req.session.user.id, score, questions.length);
  res.json({ attempt_id: result.lastInsertRowid, score, total: questions.length });
});

app.get('/api/student/attendance', requireStudent, (req, res) => {
  res.json(db.prepare(`
    SELECT a.date, a.status, c.code AS course_code, c.title AS course_title
    FROM attendance a JOIN courses c ON c.id = a.course_id
    WHERE a.student_id = ? ORDER BY a.date DESC
  `).all(req.session.user.id));
});

app.get('/api/student/grades', requireStudent, (req, res) => {
  const assignmentGrades = db.prepare(`
    SELECT a.title, a.max_score, s.score, c.title AS course_title, c.code AS course_code
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.student_id = ? AND s.score IS NOT NULL
  `).all(req.session.user.id);

  const quizGrades = db.prepare(`
    SELECT q.title, qa.score, qa.total, c.title AS course_title, c.code AS course_code
    FROM quiz_attempts qa
    JOIN quizzes q ON q.id = qa.quiz_id
    JOIN courses c ON c.id = q.course_id
    WHERE qa.student_id = ?
  `).all(req.session.user.id);

  const attendanceSummary = db.prepare(`
    SELECT status, COUNT(*) AS count FROM attendance WHERE student_id = ? GROUP BY status
  `).all(req.session.user.id);

  res.json({ assignmentGrades, quizGrades, attendanceSummary });
});

// =====================================================================
// ======================== ADMIN: EXTENDED MODULES =====================
// =====================================================================

// ---------- Admin: faculty ----------
app.get('/api/admin/faculty', requireAdmin, (req, res) => {
  const faculty = db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.mobile,
      (SELECT COUNT(*) FROM faculty_courses fc WHERE fc.faculty_id = u.id) AS course_count
    FROM users u WHERE u.role = 'faculty' ORDER BY u.name
  `).all();
  const courses = db.prepare(`
    SELECT fc.faculty_id, c.id AS course_id, c.code, c.title
    FROM faculty_courses fc JOIN courses c ON c.id = fc.course_id ORDER BY c.code
  `).all();
  const byFaculty = {};
  for (const c of courses) {
    if (!byFaculty[c.faculty_id]) byFaculty[c.faculty_id] = [];
    byFaculty[c.faculty_id].push({ id: c.course_id, code: c.code, title: c.title });
  }
  res.json(faculty.map(f => ({ ...f, courses: byFaculty[f.id] || [] })));
});

app.post('/api/admin/faculty', requireAdmin, (req, res) => {
  const { username, password, name, email, mobile, course_ids } = req.body || {};
  if (!username || !password || !name) return res.status(400).json({ error: 'Username, password and name are required' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const result = db.prepare(
    'INSERT INTO users (role, username, password_hash, name, email, mobile) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('faculty', username, bcrypt.hashSync(password, 10), name, email || null, mobile || null);
  const stmt = db.prepare('INSERT INTO faculty_courses (faculty_id, course_id) VALUES (?, ?)');
  for (const cid of course_ids || []) {
    try { stmt.run(result.lastInsertRowid, cid); } catch (_) {}
  }
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/faculty/:id', requireAdmin, (req, res) => {
  const faculty = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'faculty'").get(req.params.id);
  if (!faculty) return res.status(404).json({ error: 'Faculty not found' });
  const { name, email, mobile, password, course_ids } = req.body || {};
  if (password) {
    db.prepare('UPDATE users SET name = ?, email = ?, mobile = ?, password_hash = ? WHERE id = ?')
      .run(name || faculty.name, email ?? faculty.email, mobile ?? faculty.mobile, bcrypt.hashSync(password, 10), faculty.id);
  } else {
    db.prepare('UPDATE users SET name = ?, email = ?, mobile = ? WHERE id = ?')
      .run(name || faculty.name, email ?? faculty.email, mobile ?? faculty.mobile, faculty.id);
  }
  if (Array.isArray(course_ids)) {
    db.prepare('DELETE FROM faculty_courses WHERE faculty_id = ?').run(faculty.id);
    const stmt = db.prepare('INSERT INTO faculty_courses (faculty_id, course_id) VALUES (?, ?)');
    for (const cid of course_ids) {
      try { stmt.run(faculty.id, cid); } catch (_) {}
    }
  }
  res.json({ ok: true });
});

app.delete('/api/admin/faculty/:id', requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'faculty'").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Faculty not found' });
  res.json({ ok: true });
});

// ---------- Admin: parents ----------
app.get('/api/admin/parents', requireAdmin, (req, res) => {
  const parents = db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.mobile,
      (SELECT COUNT(*) FROM parent_students ps WHERE ps.parent_id = u.id) AS child_count
    FROM users u WHERE u.role = 'parent' ORDER BY u.name
  `).all();
  const links = db.prepare(`
    SELECT ps.parent_id, s.id AS student_id, s.username, s.name AS student_name
    FROM parent_students ps JOIN users s ON s.id = ps.student_id ORDER BY s.name
  `).all();
  const byParent = {};
  for (const l of links) {
    if (!byParent[l.parent_id]) byParent[l.parent_id] = [];
    byParent[l.parent_id].push({ id: l.student_id, username: l.username, name: l.student_name });
  }
  res.json(parents.map(p => ({ ...p, children: byParent[p.id] || [] })));
});

app.post('/api/admin/parents', requireAdmin, (req, res) => {
  const { username, password, name, email, mobile, student_ids } = req.body || {};
  if (!username || !password || !name) return res.status(400).json({ error: 'Username, password and name are required' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const result = db.prepare(
    'INSERT INTO users (role, username, password_hash, name, email, mobile) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('parent', username, bcrypt.hashSync(password, 10), name, email || null, mobile || null);
  const stmt = db.prepare('INSERT INTO parent_students (parent_id, student_id) VALUES (?, ?)');
  for (const sid of student_ids || []) {
    try { stmt.run(result.lastInsertRowid, sid); } catch (_) {}
  }
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/parents/:id', requireAdmin, (req, res) => {
  const parent = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'parent'").get(req.params.id);
  if (!parent) return res.status(404).json({ error: 'Parent not found' });
  const { name, email, mobile, password, student_ids } = req.body || {};
  if (password) {
    db.prepare('UPDATE users SET name = ?, email = ?, mobile = ?, password_hash = ? WHERE id = ?')
      .run(name || parent.name, email ?? parent.email, mobile ?? parent.mobile, bcrypt.hashSync(password, 10), parent.id);
  } else {
    db.prepare('UPDATE users SET name = ?, email = ?, mobile = ? WHERE id = ?')
      .run(name || parent.name, email ?? parent.email, mobile ?? parent.mobile, parent.id);
  }
  if (Array.isArray(student_ids)) {
    db.prepare('DELETE FROM parent_students WHERE parent_id = ?').run(parent.id);
    const stmt = db.prepare('INSERT INTO parent_students (parent_id, student_id) VALUES (?, ?)');
    for (const sid of student_ids) {
      try { stmt.run(parent.id, sid); } catch (_) {}
    }
  }
  res.json({ ok: true });
});

app.delete('/api/admin/parents/:id', requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'parent'").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Parent not found' });
  res.json({ ok: true });
});

// ---------- Admin: batches ----------
app.get('/api/admin/batches', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT b.*, c.code AS course_code, c.title AS course_title,
      (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) AS student_count,
      (SELECT COUNT(*) FROM timetable t WHERE t.batch_id = b.id) AS slot_count
    FROM batches b JOIN courses c ON c.id = b.course_id ORDER BY b.name
  `).all());
});

app.post('/api/admin/batches', requireAdmin, (req, res) => {
  const { course_id, name, start_date, end_date, capacity } = req.body || {};
  if (!course_id || !name) return res.status(400).json({ error: 'Course and batch name are required' });
  const result = db.prepare(
    'INSERT INTO batches (course_id, name, start_date, end_date, capacity) VALUES (?, ?, ?, ?, ?)'
  ).run(course_id, name, start_date || null, end_date || null, capacity || 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/batches/:id', requireAdmin, (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  const { name, start_date, end_date, capacity } = req.body || {};
  db.prepare('UPDATE batches SET name = ?, start_date = ?, end_date = ?, capacity = ? WHERE id = ?')
    .run(name || batch.name, start_date ?? batch.start_date, end_date ?? batch.end_date,
         capacity != null ? Number(capacity) : batch.capacity, batch.id);
  res.json({ ok: true });
});

app.delete('/api/admin/batches/:id', requireAdmin, (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  db.prepare('UPDATE enrollments SET batch_id = NULL WHERE batch_id = ?').run(batch.id);
  db.prepare('DELETE FROM batches WHERE id = ?').run(batch.id);
  res.json({ ok: true });
});

app.get('/api/admin/batches/:id', requireAdmin, (req, res) => {
  const batch = db.prepare(`
    SELECT b.*, c.code AS course_code, c.title AS course_title
    FROM batches b JOIN courses c ON c.id = b.course_id WHERE b.id = ?
  `).get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  const students = db.prepare(`
    SELECT u.id, u.username, u.name, u.mobile
    FROM enrollments e JOIN users u ON u.id = e.student_id
    WHERE e.batch_id = ? ORDER BY u.name
  `).all(batch.id);
  const timetable = db.prepare(
    'SELECT * FROM timetable WHERE batch_id = ? ORDER BY CASE day WHEN \'Monday\' THEN 1 WHEN \'Tuesday\' THEN 2 WHEN \'Wednesday\' THEN 3 WHEN \'Thursday\' THEN 4 WHEN \'Friday\' THEN 5 ELSE 6 END, start_time'
  ).all(batch.id);
  const availableStudents = db.prepare(`
    SELECT u.id, u.username, u.name FROM users u
    WHERE u.role = 'student'
      AND EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = u.id AND e.course_id = ?)
      AND NOT EXISTS (SELECT 1 FROM enrollments e2 WHERE e2.student_id = u.id AND e2.batch_id = ?)
    ORDER BY u.name
  `).all(batch.course_id, batch.id);
  res.json({ batch, students, timetable, availableStudents });
});

app.post('/api/admin/batches/:id/students', requireAdmin, (req, res) => {
  const { student_id } = req.body || {};
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  const result = db.prepare(
    'UPDATE enrollments SET batch_id = ? WHERE student_id = ? AND course_id = ?'
  ).run(batch.id, student_id, batch.course_id);
  if (result.changes === 0) return res.status(400).json({ error: 'Student is not enrolled in this course or already in a batch' });
  res.json({ ok: true });
});

app.delete('/api/admin/batches/:id/students/:sid', requireAdmin, (req, res) => {
  db.prepare('UPDATE enrollments SET batch_id = NULL WHERE student_id = ? AND batch_id = ?')
    .run(req.params.sid, req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: timetable ----------
app.post('/api/admin/timetable', requireAdmin, (req, res) => {
  const { batch_id, day, start_time, end_time, subject, instructor } = req.body || {};
  if (!batch_id || !day || !start_time || !end_time || !subject) {
    return res.status(400).json({ error: 'Batch, day, times and subject are required' });
  }
  const result = db.prepare(
    'INSERT INTO timetable (batch_id, day, start_time, end_time, subject, instructor) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(batch_id, day, start_time, end_time, subject, instructor || '');
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/timetable/:id', requireAdmin, (req, res) => {
  const slot = db.prepare('SELECT * FROM timetable WHERE id = ?').get(req.params.id);
  if (!slot) return res.status(404).json({ error: 'Timetable slot not found' });
  const { day, start_time, end_time, subject, instructor } = req.body || {};
  db.prepare('UPDATE timetable SET day = ?, start_time = ?, end_time = ?, subject = ?, instructor = ? WHERE id = ?')
    .run(day || slot.day, start_time || slot.start_time, end_time || slot.end_time,
         subject || slot.subject, instructor ?? slot.instructor, slot.id);
  res.json({ ok: true });
});

app.delete('/api/admin/timetable/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM timetable WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: payments & receipts ----------
app.get('/api/admin/payments', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT p.*, u.username, u.name AS student_name
    FROM payments p JOIN users u ON u.id = p.student_id
    ORDER BY p.paid_at DESC, p.id DESC
  `).all());
});

app.post('/api/admin/payments', requireAdmin, (req, res) => {
  const { student_id, amount, method, note } = req.body || {};
  if (!student_id || amount == null) return res.status(400).json({ error: 'Student and amount are required' });
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(student_id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const receiptNo = 'RCP-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
  const result = db.prepare(
    'INSERT INTO payments (student_id, amount, method, receipt_no, note, paid_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
  ).run(student_id, Number(amount), method || 'cash', receiptNo, note || null);
  // Auto-mark fee paid when this payment clears the fee amount.
  const totalPaid = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE student_id = ?').get(student_id).t;
  if (totalPaid >= (student.fee_amount || 0)) {
    db.prepare('UPDATE users SET fee_paid = 1 WHERE id = ?').run(student_id);
  }
  res.status(201).json({ id: result.lastInsertRowid, receipt_no: receiptNo });
});

app.get('/api/admin/payments/:id/receipt', requireAdmin, (req, res) => {
  const payment = db.prepare(`
    SELECT p.*, u.username, u.name AS student_name, u.email, u.mobile, u.fee_amount
    FROM payments p JOIN users u ON u.id = p.student_id WHERE p.id = ?
  `).get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  res.json(payment);
});

app.delete('/api/admin/payments/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: exams & results ----------
app.get('/api/admin/exams', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT x.*, c.code AS course_code, c.title AS course_title,
      (SELECT COUNT(*) FROM exam_results r WHERE r.exam_id = x.id) AS result_count,
      (SELECT COUNT(*) FROM exam_questions q WHERE q.exam_id = x.id) AS question_count
    FROM exams x JOIN courses c ON c.id = x.course_id ORDER BY x.exam_date
  `).all());
});

app.post('/api/admin/exams', requireAdmin, (req, res) => {
  const { course_id, title, exam_date, max_marks, duration_minutes } = req.body || {};
  if (!course_id || !title) return res.status(400).json({ error: 'Course and exam title are required' });
  const result = db.prepare(
    'INSERT INTO exams (course_id, title, exam_date, max_marks, duration_minutes) VALUES (?, ?, ?, ?, ?)'
  ).run(course_id, title, exam_date || null, max_marks || 100, duration_minutes || 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/exams/:id', requireAdmin, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const { title, exam_date, max_marks, duration_minutes } = req.body || {};
  db.prepare('UPDATE exams SET title = ?, exam_date = ?, max_marks = ?, duration_minutes = ? WHERE id = ?')
    .run(title || exam.title, exam_date ?? exam.exam_date, max_marks || exam.max_marks, duration_minutes ?? exam.duration_minutes, exam.id);
  res.json({ ok: true });
});

app.delete('/api/admin/exams/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM exams WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/exams/:id/results', requireAdmin, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const enrolled = db.prepare(`
    SELECT u.id, u.username, u.name, r.marks
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    LEFT JOIN exam_results r ON r.exam_id = ? AND r.student_id = u.id
    WHERE e.course_id = ? ORDER BY u.name
  `).all(exam.id, exam.course_id);
  res.json({ exam, rows: enrolled });
});

app.post('/api/admin/exams/:id/results', requireAdmin, (req, res) => {
  const { marks } = req.body || {};
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const stmt = db.prepare(`
    INSERT INTO exam_results (exam_id, student_id, marks) VALUES (?, ?, ?)
    ON CONFLICT(exam_id, student_id) DO UPDATE SET marks = excluded.marks
  `);
  db.exec('BEGIN');
  try {
    for (const [sid, m] of Object.entries(marks || {})) {
      stmt.run(exam.id, Number(sid), Number(m));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ ok: true });
});

// ---------- Admin: online exam question bank ----------
function syncExamMaxMarks(examId) {
  db.prepare(
    'UPDATE exams SET max_marks = COALESCE((SELECT SUM(marks) FROM exam_questions WHERE exam_id = ?), max_marks) WHERE id = ?'
  ).run(examId, examId);
}

app.get('/api/admin/exams/:id/questions', requireAdmin, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const questions = db.prepare('SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY id').all(exam.id)
    .map(q => ({ ...q, options: JSON.parse(q.options) }));
  res.json({ exam, questions });
});

app.post('/api/admin/exams/:id/questions', requireAdmin, (req, res) => {
  const { text, options, correct_index, marks } = req.body || {};
  if (!text || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Question text and at least two options are required' });
  }
  if (typeof correct_index !== 'number' || correct_index < 0 || correct_index >= options.length) {
    return res.status(400).json({ error: 'Correct option index is out of range' });
  }
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const result = db.prepare(
    'INSERT INTO exam_questions (exam_id, text, options, correct_index, marks) VALUES (?, ?, ?, ?, ?)'
  ).run(exam.id, text, JSON.stringify(options), correct_index, marks || 1);
  syncExamMaxMarks(exam.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/exams/:id/questions/:qid', requireAdmin, (req, res) => {
  const q = db.prepare('SELECT * FROM exam_questions WHERE id = ? AND exam_id = ?').get(req.params.qid, req.params.id);
  if (!q) return res.status(404).json({ error: 'Question not found' });
  const { text, options, correct_index, marks } = req.body || {};
  const opts = Array.isArray(options) && options.length >= 2 ? options : JSON.parse(q.options);
  const idx = typeof correct_index === 'number' ? correct_index : q.correct_index;
  if (idx < 0 || idx >= opts.length) return res.status(400).json({ error: 'Correct option index is out of range' });
  db.prepare('UPDATE exam_questions SET text = ?, options = ?, correct_index = ?, marks = ? WHERE id = ?')
    .run(text || q.text, JSON.stringify(opts), idx, marks || q.marks, q.id);
  syncExamMaxMarks(Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/admin/exams/:id/questions/:qid', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM exam_questions WHERE id = ? AND exam_id = ?').run(req.params.qid, req.params.id);
  syncExamMaxMarks(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Admin: certificates ----------
app.get('/api/admin/certificates', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT cert.*, u.username, u.name AS student_name, c.code AS course_code, c.title AS course_title
    FROM certificates cert
    JOIN users u ON u.id = cert.student_id
    JOIN courses c ON c.id = cert.course_id
    ORDER BY cert.id DESC
  `).all());
});

app.post('/api/admin/certificates', requireAdmin, (req, res) => {
  const { student_id, course_id, type } = req.body || {};
  if (!student_id || !course_id) return res.status(400).json({ error: 'Student and course are required' });
  const certNo = 'CERT-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
  const result = db.prepare(
    'INSERT INTO certificates (student_id, course_id, cert_no, type, issued_date) VALUES (?, ?, ?, ?, date(\'now\'))'
  ).run(student_id, course_id, certNo, type || 'completion');
  res.status(201).json({ id: result.lastInsertRowid, cert_no: certNo });
});

app.delete('/api/admin/certificates/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM certificates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: notifications / reminders ----------
app.get('/api/admin/notifications', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT n.*, u.username, u.name AS student_name, u.mobile
    FROM notifications n JOIN users u ON u.id = n.student_id
    ORDER BY n.id DESC LIMIT 200
  `).all());
});

app.get('/api/admin/notifications/status', requireAdmin, (req, res) => {
  res.json({ configured: notify.isConfigured() });
});

app.post('/api/admin/notifications/send', requireAdmin, async (req, res) => {
  const { channel, purpose, student_id, message } = req.body || {};
  if (!student_id || !channel || !purpose) {
    return res.status(400).json({ error: 'Student, channel and purpose are required' });
  }
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(student_id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!student.mobile) return res.status(400).json({ error: 'Student has no mobile number' });
  const msg = message || defaultReminder(student, purpose);
  const result = await notify.sendReminder({ to: student.mobile, channel, message: msg });
  db.prepare(
    'INSERT INTO notifications (student_id, channel, purpose, message, status, sent_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
  ).run(student_id, channel, purpose, msg, result.status);
  res.status(201).json({ ok: true, status: result.status, simulated: !!result.simulated });
});

app.post('/api/admin/notifications/send-all', requireAdmin, async (req, res) => {
  const { channel, purpose, student_ids } = req.body || {};
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return res.status(400).json({ error: 'Select at least one student' });
  }
  const students = db.prepare('SELECT * FROM users WHERE id IN (' + student_ids.map(() => '?').join(',') + ')').all(...student_ids);
  const insert = db.prepare(
    'INSERT INTO notifications (student_id, channel, purpose, message, status, sent_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
  );
  let sent = 0;
  for (const s of students) {
    if (!s.mobile) continue;
    const msg = defaultReminder(s, purpose);
    const result = await notify.sendReminder({ to: s.mobile, channel: channel || 'sms', message: msg });
    insert.run(s.id, channel || 'sms', purpose, msg, result.status);
    if (result.status === 'sent') sent += 1;
  }
  res.json({ ok: true, sent });
});

function defaultReminder(student, purpose) {
  const name = student.name.split(' ')[0];
  if (purpose === 'fee') {
    const status = student.fee_paid ? 'your fee has been cleared' : `your fee of Rs. ${student.fee_amount || 0} is still pending`;
    return `Hi ${name}, ${status}. Please contact the office. - VUMCA hITECH Computing`;
  }
  if (purpose === 'class') {
    return `Hi ${name}, reminder: your computer class is scheduled for tomorrow. Be on time! - VUMCA hITECH Computing`;
  }
  return `Hi ${name}, this is a reminder from VUMCA hITECH Computing.`;
}

// =====================================================================
// ======================== STUDENT: EXTENDED MODULES ===================
// =====================================================================

app.get('/api/student/timetable', requireStudent, (req, res) => {
  res.json(db.prepare(`
    SELECT t.*, b.name AS batch_name, c.code AS course_code
    FROM timetable t
    JOIN batches b ON b.id = t.batch_id
    JOIN enrollments e ON e.batch_id = b.id
    JOIN courses c ON c.id = b.course_id
    WHERE e.student_id = ?
    ORDER BY CASE t.day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, t.start_time
  `).all(req.session.user.id));
});

app.get('/api/student/exams', requireStudent, (req, res) => {
  res.json(db.prepare(`
    SELECT x.*, c.code AS course_code, c.title AS course_title, r.marks,
      (SELECT COUNT(*) FROM exam_questions q WHERE q.exam_id = x.id) AS question_count
    FROM enrollments e
    JOIN exams x ON x.course_id = e.course_id
    JOIN courses c ON c.id = x.course_id
    LEFT JOIN exam_results r ON r.exam_id = x.id AND r.student_id = e.student_id
    WHERE e.student_id = ? ORDER BY x.exam_date
  `).all(req.session.user.id));
});

// ---------- Student: online exam taking ----------
app.get('/api/student/exams/:id/paper', requireStudent, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const enrolled = db.prepare('SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?')
    .get(req.session.user.id, exam.course_id);
  if (!enrolled) return res.status(403).json({ error: 'You are not enrolled in this course' });
  if (db.prepare('SELECT id FROM exam_results WHERE exam_id = ? AND student_id = ?').get(exam.id, req.session.user.id)) {
    return res.status(409).json({ error: 'You have already submitted this exam' });
  }
  const questions = db.prepare('SELECT id, text, options, marks FROM exam_questions WHERE exam_id = ? ORDER BY id').all(exam.id)
    .map(q => ({ ...q, options: JSON.parse(q.options) }));
  if (!questions.length) return res.status(400).json({ error: 'No question paper published yet' });
  res.json({
    exam: { id: exam.id, title: exam.title, duration_minutes: exam.duration_minutes || 0, max_marks: exam.max_marks },
    questions,
  });
});

app.post('/api/student/exams/:id/submit', requireStudent, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const enrolled = db.prepare('SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?')
    .get(req.session.user.id, exam.course_id);
  if (!enrolled) return res.status(403).json({ error: 'You are not enrolled in this course' });
  if (db.prepare('SELECT id FROM exam_results WHERE exam_id = ? AND student_id = ?').get(exam.id, req.session.user.id)) {
    return res.status(409).json({ error: 'You have already submitted this exam' });
  }
  const questions = db.prepare('SELECT * FROM exam_questions WHERE exam_id = ?').all(exam.id);
  if (!questions.length) return res.status(400).json({ error: 'No question paper published yet' });
  const answers = (req.body || {}).answers || {};
  let score = 0;
  let total = 0;
  for (const q of questions) {
    const marks = q.marks || 1;
    total += marks;
    if (Number(answers[q.id]) === q.correct_index) score += marks;
  }
  db.prepare('INSERT INTO exam_results (exam_id, student_id, marks) VALUES (?, ?, ?)').run(exam.id, req.session.user.id, score);
  res.status(201).json({ score, total, percentage: total ? Math.round((score / total) * 100) : 0 });
});

app.get('/api/student/fees', requireStudent, (req, res) => {
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const payments = db.prepare(`
    SELECT p.* FROM payments p WHERE p.student_id = ? ORDER BY p.paid_at DESC
  `).all(req.session.user.id);
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  res.json({
    fee_amount: student.fee_amount || 0,
    fee_paid: student.fee_paid,
    total_paid: totalPaid,
    pending: Math.max(0, (student.fee_amount || 0) - totalPaid),
    payments,
  });
});

app.get('/api/student/certificates', requireStudent, (req, res) => {
  res.json(db.prepare(`
    SELECT cert.*, c.code AS course_code, c.title AS course_title
    FROM certificates cert JOIN courses c ON c.id = cert.course_id
    WHERE cert.student_id = ? ORDER BY cert.id DESC
  `).all(req.session.user.id));
});

// =====================================================================
// ======================== FACULTY PORTAL ==============================
// =====================================================================

app.get('/api/faculty/courses', requireFaculty, (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, b.id AS batch_id, b.name AS batch_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count
    FROM faculty_courses fc
    JOIN courses c ON c.id = fc.course_id
    LEFT JOIN batches b ON b.course_id = c.id
    WHERE fc.faculty_id = ? ORDER BY c.code
  `).all(req.session.user.id));
});

app.get('/api/faculty/timetable', requireFaculty, (req, res) => {
  res.json(db.prepare(`
    SELECT t.*, b.name AS batch_name, c.code AS course_code
    FROM timetable t
    JOIN batches b ON b.id = t.batch_id
    JOIN courses c ON c.id = b.course_id
    JOIN faculty_courses fc ON fc.course_id = c.id
    WHERE fc.faculty_id = ?
    ORDER BY CASE t.day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, t.start_time
  `).all(req.session.user.id));
});

app.get('/api/faculty/courses/:id/students', requireFaculty, (req, res) => {
  const owned = db.prepare(
    'SELECT id FROM faculty_courses WHERE faculty_id = ? AND course_id = ?'
  ).get(req.session.user.id, req.params.id);
  if (!owned) return res.status(403).json({ error: 'Not assigned to this course' });
  res.json(db.prepare(`
    SELECT u.id, u.username, u.name, u.mobile,
      (SELECT COUNT(*) FROM attendance a WHERE a.student_id = u.id AND a.course_id = ?) AS attendance_count
    FROM enrollments e JOIN users u ON u.id = e.student_id
    WHERE e.course_id = ? ORDER BY u.name
  `).all(req.params.id, req.params.id));
});

app.post('/api/faculty/attendance', requireFaculty, (req, res) => {
  const { student_id, course_id, date, status } = req.body || {};
  const owned = db.prepare(
    'SELECT id FROM faculty_courses WHERE faculty_id = ? AND course_id = ?'
  ).get(req.session.user.id, course_id);
  if (!owned) return res.status(403).json({ error: 'Not assigned to this course' });
  db.prepare(`
    INSERT INTO attendance (student_id, course_id, date, status) VALUES (?, ?, ?, ?)
    ON CONFLICT(student_id, course_id, date) DO UPDATE SET status = excluded.status
  `).run(student_id, course_id, date, status);
  res.json({ ok: true });
});

app.get('/api/faculty/courses/:id/assignments', requireFaculty, (req, res) => {
  const owned = db.prepare(
    'SELECT id FROM faculty_courses WHERE faculty_id = ? AND course_id = ?'
  ).get(req.session.user.id, req.params.id);
  if (!owned) return res.status(403).json({ error: 'Not assigned to this course' });
  res.json(db.prepare('SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date').all(req.params.id));
});

app.get('/api/faculty/assignments/:id/submissions', requireFaculty, (req, res) => {
  const assignment = db.prepare(`
    SELECT a.*, fc.id AS owned FROM assignments a
    JOIN faculty_courses fc ON fc.course_id = a.course_id
    WHERE a.id = ? AND fc.faculty_id = ?
  `).get(req.params.id, req.session.user.id);
  if (!assignment) return res.status(403).json({ error: 'Not assigned to this course' });
  res.json(db.prepare(`
    SELECT s.*, u.username, u.name AS student_name
    FROM submissions s JOIN users u ON u.id = s.student_id
    WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC
  `).all(req.params.id));
});

app.post('/api/faculty/assignments/:id/submissions/:sid/grade', requireFaculty, (req, res) => {
  const { score } = req.body || {};
  const assignment = db.prepare(`
    SELECT a.id FROM assignments a
    JOIN faculty_courses fc ON fc.course_id = a.course_id
    WHERE a.id = ? AND fc.faculty_id = ?
  `).get(req.params.id, req.session.user.id);
  if (!assignment) return res.status(403).json({ error: 'Not assigned to this course' });
  db.prepare('UPDATE submissions SET score = ? WHERE id = ?').run(Number(score), req.params.sid);
  res.json({ ok: true });
});

// =====================================================================
// ======================== PARENT PORTAL ===============================
// =====================================================================

app.get('/api/parent/children', requireParent, (req, res) => {
  res.json(db.prepare(`
    SELECT s.id, s.username, s.name, s.mobile
    FROM parent_students ps JOIN users s ON s.id = ps.student_id
    WHERE ps.parent_id = ? ORDER BY s.name
  `).all(req.session.user.id));
});

app.get('/api/parent/children/:id/dashboard', requireParent, (req, res) => {
  const childId = Number(req.params.id);
  const linked = db.prepare(
    'SELECT id FROM parent_students WHERE parent_id = ? AND student_id = ?'
  ).get(req.session.user.id, childId);
  if (!linked) return res.status(403).json({ error: 'Not linked to this student' });

  const student = db.prepare('SELECT * FROM users WHERE id = ?').get(childId);
  const courses = db.prepare(`
    SELECT c.code, c.title, c.instructor FROM enrollments e
    JOIN courses c ON c.id = e.course_id WHERE e.student_id = ?
  `).all(childId);
  const attendance = db.prepare(`
    SELECT a.date, a.status, c.code AS course_code FROM attendance a
    JOIN courses c ON c.id = a.course_id WHERE a.student_id = ? ORDER BY a.date DESC
  `).all(childId);
  const payments = db.prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY paid_at DESC').all(childId);
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const examResults = db.prepare(`
    SELECT x.title, x.max_marks, r.marks, c.code AS course_code
    FROM exam_results r
    JOIN exams x ON x.id = r.exam_id
    JOIN courses c ON c.id = x.course_id
    WHERE r.student_id = ?
  `).all(childId);

  const present = attendance.filter(a => a.status === 'present').length;
  const late = attendance.filter(a => a.status === 'late').length;
  const totalDays = attendance.length;

  res.json({
    student: { name: student.name, username: student.username, mobile: student.mobile },
    courses,
    attendance,
    attendanceSummary: { present, late, absent: totalDays - present - late, total: totalDays },
    fee: { fee_amount: student.fee_amount, fee_paid: student.fee_paid, total_paid: totalPaid, pending: Math.max(0, (student.fee_amount || 0) - totalPaid) },
    payments,
    examResults,
  });
});

// =====================================================================
// ================== ONLINE FEE PAYMENTS (RAZORPAY) ===================
// =====================================================================

const requirePayer = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.user.role !== 'student' && req.session.user.role !== 'parent') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

function payerCanAccess(req, studentId) {
  const u = req.session.user;
  if (u.role === 'student') return u.id === studentId;
  return Boolean(
    db.prepare('SELECT id FROM parent_students WHERE parent_id = ? AND student_id = ?').get(u.id, studentId)
  );
}

app.get('/api/payment/config', requireAuth, (req, res) => {
  res.json({ enabled: razorpay.isConfigured(), key_id: razorpay.isConfigured() ? razorpay.getKeyId() : null });
});

app.post('/api/payment/order', requirePayer, async (req, res) => {
  try {
    if (!razorpay.isConfigured()) return res.status(400).json({ error: 'Online payments are not enabled' });
    const studentId = Number((req.body || {}).student_id);
    const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (!payerCanAccess(req, studentId)) return res.status(403).json({ error: 'Not linked to this student' });
    const paid = db.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM payments WHERE student_id = ?').get(studentId).t;
    const pending = Math.max(0, (student.fee_amount || 0) - paid);
    if (pending <= 0) return res.status(400).json({ error: 'No pending dues to pay' });
    const order = await razorpay.createOrder({ amountInRupees: pending, receipt: 'rcpt_' + Date.now() });
    res.json({ order_id: order.id, amount: pending, currency: 'INR', key_id: razorpay.getKeyId() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payment/verify', requirePayer, async (req, res) => {
  try {
    if (!razorpay.isConfigured()) return res.status(400).json({ error: 'Online payments are not enabled' });
    const { student_id, order_id, payment_id, signature } = req.body || {};
    const studentId = Number(student_id);
    if (!order_id || !payment_id || !signature) return res.status(400).json({ error: 'Missing payment details' });
    const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (!payerCanAccess(req, studentId)) return res.status(403).json({ error: 'Not linked to this student' });
    if (!razorpay.verifySignature({ orderId: order_id, paymentId: payment_id, signature })) {
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }
    const order = await razorpay.getOrder(order_id);
    const amount = (order.amount || 0) / 100;
    if (amount <= 0) return res.status(400).json({ error: 'Invalid order amount' });

    const receiptNo = 'RCP-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
    db.prepare(
      "INSERT INTO payments (student_id, amount, method, receipt_no, note, paid_at) VALUES (?, ?, 'razorpay', ?, 'Online payment (Razorpay)', datetime('now'))"
    ).run(studentId, amount, receiptNo);
    const totalPaid = db.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM payments WHERE student_id = ?').get(studentId).t;
    const cleared = totalPaid >= (student.fee_amount || 0);
    if (cleared) db.prepare('UPDATE users SET fee_paid = 1 WHERE id = ?').run(studentId);

    let notifStatus = 'failed';
    try {
      const msg = `Hi ${student.name.split(' ')[0]}, we received Rs. ${amount} online (Receipt ${receiptNo}). Thank you! - VUMCA hITECH Computing`;
      const r = await notify.sendReminder({ to: student.mobile, channel: 'whatsapp', message: msg });
      notifStatus = r.status;
      db.prepare('INSERT INTO notifications (student_id, channel, purpose, message, status, sent_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))')
        .run(studentId, 'whatsapp', 'fee', msg, notifStatus);
    } catch (_) {}

    res.json({ ok: true, amount, receipt_no: receiptNo, cleared });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`VUMCA LMS running on http://localhost:${PORT}`);
});
