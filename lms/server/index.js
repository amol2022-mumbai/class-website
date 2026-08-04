const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');

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
    SELECT u.id, u.username, u.name, u.email,
           (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id) AS course_count,
           (SELECT COUNT(*) FROM attendance a WHERE a.student_id = u.id AND a.status = 'present') AS present_days
    FROM users u WHERE u.role = 'student' ORDER BY u.name
  `).all();
  res.json(students);
});

app.post('/api/admin/students', requireAdmin, (req, res) => {
  const { username, password, name, email } = req.body || {};
  if (!username || !password || !name) return res.status(400).json({ error: 'Username, password and name are required' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (role, username, password_hash, name, email) VALUES (?, ?, ?, ?, ?)'
  ).run('student', username, hash, name, email || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/students/:id', requireAdmin, (req, res) => {
  const { name, email, password } = req.body || {};
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?')
      .run(name || student.name, email ?? student.email, hash, student.id);
  } else {
    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?')
      .run(name || student.name, email ?? student.email, student.id);
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

app.listen(PORT, () => {
  console.log(`VUMCA LMS running on http://localhost:${PORT}`);
});
