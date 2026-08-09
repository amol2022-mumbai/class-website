const path = require('path');
const fs = require('fs');
require('dotenv').config({ quiet: true });
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');
const razorpay = require('./razorpay');
const finance = require('./finance');
const payroll = require('./payroll');
const reminders = require('./reminders');
const broadcasts = require('./broadcasts');
const email = require('./email');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '60mb' }));
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

// Resolves the admin's active branch (session) or falls back to the first one.
function activeBranch(req) {
  if (req.session.user && req.session.user.role === 'admin' && req.session.branchId) {
    return req.session.branchId;
  }
  const first = db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
  return first ? first.id : null;
}

function branchWhere(alias, bid) {
  return bid ? `${alias}.branch_id = ?` : '1=1';
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
  if (user.role === 'admin' && !req.session.branchId) {
    const first = db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
    if (first) req.session.branchId = first.id;
  }
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
  const bid = activeBranch(req);
  const bw = branchWhere('u', bid);
  const cw = branchWhere('c', bid);
  const params = bid ? [bid] : [];
  const students = db.prepare(`SELECT COUNT(*) AS c FROM users u WHERE u.role = 'student' AND ${bw}`).get(...params).c;
  const courses = db.prepare(`SELECT COUNT(*) AS c FROM courses c WHERE ${cw}`).get(...params).c;
  const assignments = db.prepare(`SELECT COUNT(*) AS c FROM assignments a JOIN courses c ON c.id = a.course_id WHERE ${cw}`).get(...params).c;
  const quizzes = db.prepare(`SELECT COUNT(*) AS c FROM quizzes q JOIN courses c ON c.id = q.course_id WHERE ${cw}`).get(...params).c;
  const enrollments = db.prepare(`
    SELECT COUNT(*) AS c FROM enrollments e
    JOIN users u ON u.id = e.student_id JOIN courses c ON c.id = e.course_id
    WHERE ${bw} AND ${cw}
  `).get(...params, ...(bid ? params : [])).c;
  const submissions = db.prepare(`
    SELECT COUNT(*) AS c FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id JOIN courses c ON c.id = a.course_id
    WHERE ${cw}
  `).get(...params).c;
  const today = new Date().toISOString().slice(0, 10);
  const presentToday = db.prepare(`
    SELECT COUNT(*) AS c FROM attendance a
    JOIN courses c ON c.id = a.course_id
    WHERE a.date = ? AND a.status = 'present' AND ${cw}
  `).get(today, ...params).c;
  const enquiries = db.prepare(`SELECT COUNT(*) AS c FROM enquiries e WHERE e.branch_id = ?`).get(bid).c;
  const openEnquiries = db.prepare(`SELECT COUNT(*) AS c FROM enquiries e WHERE e.branch_id = ? AND e.status NOT IN ('enrolled','lost')`).get(bid).c;
  const overdueFees = db.prepare(`
    SELECT COUNT(*) AS c FROM installments i
    JOIN users u ON u.id = i.student_id
    WHERE i.paid_amount < i.amount AND i.due_date < ? AND ${bw}
  `).get(today, ...(bid ? [bid] : [])).c;
  res.json({ students, courses, assignments, quizzes, enrollments, submissions, presentToday, enquiries, openEnquiries, overdueFees });
});

// ---------- Admin: branches ----------
app.get('/api/admin/branches', requireAdmin, (req, res) => {
  res.json({
    branches: db.prepare(`
      SELECT b.*,
        (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.role = 'student') AS students,
        (SELECT COUNT(*) FROM courses c WHERE c.branch_id = b.id) AS courses,
        (SELECT COUNT(*) FROM staff s WHERE s.branch_id = b.id) AS staff,
        (SELECT COUNT(*) FROM expenses e WHERE e.branch_id = b.id) AS expenses
      FROM branches b ORDER BY b.id
    `).all(),
    active: activeBranch(req),
  });
});

app.post('/api/admin/branches', requireAdmin, (req, res) => {
  const { name, code, address, phone, email, gstin, gst_rate } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: 'Branch name and code are required' });
  if (db.prepare('SELECT id FROM branches WHERE code = ?').get(code)) {
    return res.status(409).json({ error: 'Branch code already exists' });
  }
  const result = db.prepare(
    'INSERT INTO branches (name, code, address, phone, email, gstin, gst_rate) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, String(code).toUpperCase(), address || '', phone || '', email || '', gstin || '', gst_rate != null ? Number(gst_rate) : 18);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/branches/:id', requireAdmin, (req, res) => {
  const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(req.params.id);
  if (!branch) return res.status(404).json({ error: 'Branch not found' });
  const { name, code, address, phone, email, gstin, gst_rate } = req.body || {};
  if (code && code !== branch.code && db.prepare('SELECT id FROM branches WHERE code = ?').get(code)) {
    return res.status(409).json({ error: 'Branch code already exists' });
  }
  db.prepare('UPDATE branches SET name = ?, code = ?, address = ?, phone = ?, email = ?, gstin = ?, gst_rate = ? WHERE id = ?')
    .run(name || branch.name, (code || branch.code).toUpperCase(), address ?? branch.address,
         phone ?? branch.phone, email ?? branch.email, gstin ?? branch.gstin,
         gst_rate != null ? Number(gst_rate) : branch.gst_rate, branch.id);
  res.json({ ok: true });
});

app.delete('/api/admin/branches/:id', requireAdmin, (req, res) => {
  const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(req.params.id);
  if (!branch) return res.status(404).json({ error: 'Branch not found' });
  const count = db.prepare('SELECT COUNT(*) AS c FROM branches').get().c;
  if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last branch' });
  const used = db.prepare(`
    SELECT (SELECT COUNT(*) FROM users WHERE branch_id = ?) +
           (SELECT COUNT(*) FROM courses WHERE branch_id = ?) +
           (SELECT COUNT(*) FROM payments WHERE branch_id = ?) +
           (SELECT COUNT(*) FROM staff WHERE branch_id = ?) +
           (SELECT COUNT(*) FROM expenses WHERE branch_id = ?) AS c
  `).get(branch.id, branch.id, branch.id, branch.id, branch.id).c;
  if (used > 0) return res.status(400).json({ error: 'Branch still has records. Move them or delete them first.' });
  db.prepare('DELETE FROM branches WHERE id = ?').run(branch.id);
  if (req.session.branchId === branch.id) {
    const first = db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
    req.session.branchId = first ? first.id : null;
  }
  res.json({ ok: true });
});

app.post('/api/admin/branches/switch', requireAdmin, (req, res) => {
  const { branch_id } = req.body || {};
  const branch = db.prepare('SELECT id, name FROM branches WHERE id = ?').get(branch_id);
  if (!branch) return res.status(404).json({ error: 'Branch not found' });
  req.session.branchId = branch.id;
  res.json({ ok: true, active: branch.id, name: branch.name });
});

// ---------- Admin: staff ----------
app.get('/api/admin/staff', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT s.*, b.name AS branch_name
    FROM staff s JOIN branches b ON b.id = s.branch_id
    WHERE ${branchWhere('s', bid)}
    ORDER BY s.name
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/staff', requireAdmin, (req, res) => {
  const { name, role, phone, email, salary, salary_type, join_date, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const bid = activeBranch(req);
  if (!bid) return res.status(400).json({ error: 'No branch configured' });
  const result = db.prepare(
    'INSERT INTO staff (branch_id, name, role, phone, email, salary, salary_type, join_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(bid, name, role || 'Staff', phone || '', email || '', salary != null ? Number(salary) : 0,
        salary_type || 'monthly', join_date || null, status || 'active');
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/staff/:id', requireAdmin, (req, res) => {
  const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
  if (!staff) return res.status(404).json({ error: 'Staff member not found' });
  const { name, role, phone, email, salary, salary_type, join_date, status } = req.body || {};
  db.prepare('UPDATE staff SET name = ?, role = ?, phone = ?, email = ?, salary = ?, salary_type = ?, join_date = ?, status = ? WHERE id = ?')
    .run(name || staff.name, role || staff.role, phone ?? staff.phone, email ?? staff.email,
         salary != null ? Number(salary) : staff.salary, salary_type || staff.salary_type,
         join_date ?? staff.join_date, status || staff.status, staff.id);
  res.json({ ok: true });
});

app.delete('/api/admin/staff/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM staff WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Staff member not found' });
  res.json({ ok: true });
});

// ---------- Admin: expenses ----------
app.get('/api/admin/expenses', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT e.*, b.name AS branch_name
    FROM expenses e JOIN branches b ON b.id = e.branch_id
    WHERE ${branchWhere('e', bid)}
    ORDER BY e.expense_date DESC, e.id DESC
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/expenses', requireAdmin, (req, res) => {
  const { category, amount, note, expense_date } = req.body || {};
  if (!category || amount == null) return res.status(400).json({ error: 'Category and amount are required' });
  const bid = activeBranch(req);
  if (!bid) return res.status(400).json({ error: 'No branch configured' });
  const result = db.prepare(
    'INSERT INTO expenses (branch_id, category, amount, note, expense_date) VALUES (?, ?, ?, ?, ?)'
  ).run(bid, category, Number(amount), note || '', expense_date || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/expenses/:id', requireAdmin, (req, res) => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  const { category, amount, note, expense_date } = req.body || {};
  db.prepare('UPDATE expenses SET category = ?, amount = ?, note = ?, expense_date = ? WHERE id = ?')
    .run(category || expense.category, amount != null ? Number(amount) : expense.amount,
         note ?? expense.note, expense_date ?? expense.expense_date, expense.id);
  res.json({ ok: true });
});

app.delete('/api/admin/expenses/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Expense not found' });
  res.json({ ok: true });
});

// ---------- Admin: enquiries / leads ----------
app.get('/api/admin/enquiries', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT e.*, c.code AS course_code, c.title AS course_title, b.name AS branch_name
    FROM enquiries e
    LEFT JOIN courses c ON c.id = e.course_id
    LEFT JOIN branches b ON b.id = e.branch_id
    WHERE ${branchWhere('e', bid)}
    ORDER BY CASE e.status WHEN 'new' THEN 0 WHEN 'follow-up' THEN 1 WHEN 'contacted' THEN 2 WHEN 'enrolled' THEN 3 ELSE 4 END, e.created_at DESC
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/enquiries', requireAdmin, (req, res) => {
  const { name, phone, email, course_id, source, status, notes, followup_date } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare(
    'INSERT INTO enquiries (branch_id, name, phone, email, course_id, source, status, notes, followup_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(activeBranch(req), name, phone || null, email || null, course_id || null,
        source || 'Walk-in', status || 'new', notes || null, followup_date || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/enquiries/:id', requireAdmin, (req, res) => {
  const enquiry = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(req.params.id);
  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
  const { name, phone, email, course_id, source, status, notes, followup_date } = req.body || {};
  db.prepare(`
    UPDATE enquiries SET name = ?, phone = ?, email = ?, course_id = ?, source = ?, status = ?, notes = ?, followup_date = ?
    WHERE id = ?
  `).run(
    name ?? enquiry.name, phone !== undefined ? phone : enquiry.phone,
    email !== undefined ? email : enquiry.email,
    course_id !== undefined ? course_id : enquiry.course_id,
    source ?? enquiry.source, status ?? enquiry.status,
    notes !== undefined ? notes : enquiry.notes,
    followup_date !== undefined ? followup_date : enquiry.followup_date,
    enquiry.id
  );
  res.json({ ok: true });
});

app.delete('/api/admin/enquiries/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM enquiries WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Enquiry not found' });
  res.json({ ok: true });
});

// ---------- Admin: staff attendance ----------
app.get('/api/admin/staff/attendance', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  const date = (req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const staff = db.prepare(`
    SELECT s.*, a.status AS att_status
    FROM staff s
    LEFT JOIN staff_attendance a ON a.staff_id = s.id AND a.date = ?
    WHERE s.status = 'active' AND ${branchWhere('s', bid)}
    ORDER BY s.name
  `).all(date, ...(bid ? [bid] : []));
  res.json({ date, staff });
});

app.post('/api/admin/staff/attendance', requireAdmin, (req, res) => {
  const { staff_id, date, status } = req.body || {};
  if (!staff_id || !date || !status) return res.status(400).json({ error: 'Staff, date and status are required' });
  if (!['present', 'absent', 'half-day', 'leave'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.prepare(`
    INSERT INTO staff_attendance (staff_id, date, status) VALUES (?, ?, ?)
    ON CONFLICT(staff_id, date) DO UPDATE SET status = excluded.status
  `).run(staff_id, date, status);
  res.json({ ok: true });
});

// ---------- Admin: payroll & payslips ----------
app.get('/api/admin/payroll', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const slips = payroll.payslipsForMonth(bid, month);
  res.json({ month, working_days: payroll.workingDaysInMonth(month), slips });
});

app.post('/api/admin/payroll/generate', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  const month = (req.body || {}).month || new Date().toISOString().slice(0, 7);
  const result = payroll.generatePayroll(bid, month);
  res.status(201).json(result);
});

app.get('/api/admin/payroll/:id', requireAdmin, (req, res) => {
  const p = db.prepare(`
    SELECT ps.*, s.name, s.role, s.phone FROM payslips ps JOIN staff s ON s.id = ps.staff_id WHERE ps.id = ?
  `).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Payslip not found' });
  res.json(p);
});

app.delete('/api/admin/payroll/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM payslips WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: students ----------
app.get('/api/admin/students', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  const students = db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.mobile, u.fee_amount, u.fee_paid, u.branch_id,
           u.discount_type, u.discount_value, u.fee_installments, u.fee_start_date,
           b.name AS branch_name,
           (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id) AS course_count,
           (SELECT COUNT(*) FROM attendance a WHERE a.student_id = u.id AND a.status = 'present') AS present_days,
           (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.student_id = u.id) AS paid
    FROM users u LEFT JOIN branches b ON b.id = u.branch_id
    WHERE u.role = 'student' AND ${branchWhere('u', bid)}
    ORDER BY u.name
  `).all(...(bid ? [bid] : []));
  res.json(students.map(s => ({
    ...s,
    effective_fee: finance.effectiveFee(s),
    discount_amount: finance.discountAmount(s),
    pending: finance.pendingAmount(s.id),
  })));
});

app.post('/api/admin/students', requireAdmin, (req, res) => {
  const { username, password, name, email, mobile, fee_amount, fee_paid, discount_type, discount_value, fee_installments, fee_start_date } = req.body || {};
  if (!username || !password || !name) return res.status(400).json({ error: 'Username, password and name are required' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const bid = activeBranch(req);
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (role, username, password_hash, name, email, mobile, fee_amount, fee_paid, branch_id, discount_type, discount_value, fee_installments, fee_start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('student', username, hash, name, email || null, mobile || null,
        fee_amount != null ? Number(fee_amount) : 0,
        fee_paid ? 1 : 0, bid,
        discount_type || 'none', Number(discount_value) || 0,
        Number(fee_installments) > 1 ? Number(fee_installments) : 1,
        fee_start_date || null);
  finance.ensureInstallments(result.lastInsertRowid);
  finance.refreshFeeStatus(result.lastInsertRowid);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/students/:id', requireAdmin, (req, res) => {
  const { name, email, mobile, fee_amount, fee_paid, password, discount_type, discount_value, fee_installments, fee_start_date } = req.body || {};
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const fields = {
    name: name ?? student.name,
    email: email ?? student.email,
    mobile: mobile ?? student.mobile,
    fee_amount: fee_amount != null ? Number(fee_amount) : student.fee_amount,
    fee_paid: fee_paid != null ? (fee_paid ? 1 : 0) : student.fee_paid,
    discount_type: discount_type != null ? (discount_type || 'none') : student.discount_type,
    discount_value: discount_value != null ? Number(discount_value) : student.discount_value,
    fee_installments: fee_installments != null ? (Number(fee_installments) > 1 ? Number(fee_installments) : 1) : student.fee_installments,
    fee_start_date: fee_start_date !== undefined ? (fee_start_date || null) : student.fee_start_date,
  };
  const update = 'UPDATE users SET name = ?, email = ?, mobile = ?, fee_amount = ?, fee_paid = ?, discount_type = ?, discount_value = ?, fee_installments = ?, fee_start_date = ?';
  if (password) {
    db.prepare(update + ', password_hash = ? WHERE id = ?')
      .run(fields.name, fields.email, fields.mobile, fields.fee_amount, fields.fee_paid, fields.discount_type, fields.discount_value, fields.fee_installments, fields.fee_start_date, bcrypt.hashSync(password, 10), student.id);
  } else {
    db.prepare(update + ' WHERE id = ?')
      .run(fields.name, fields.email, fields.mobile, fields.fee_amount, fields.fee_paid, fields.discount_type, fields.discount_value, fields.fee_installments, fields.fee_start_date, student.id);
  }
  finance.ensureInstallments(student.id);
  finance.refreshFeeStatus(student.id);
  res.json({ ok: true });
});

app.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Student not found' });
  res.json({ ok: true });
});

app.get('/api/admin/students/:id/plan', requireAdmin, (req, res) => {
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const snap = finance.feeSnapshot(student.id);
  const payments = db.prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY paid_at DESC').all(student.id);
  res.json({ ...snap, payments });
});

// ---------- Admin: courses ----------
app.get('/api/admin/courses', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT c.*, b.name AS branch_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignment_count,
      (SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id) AS quiz_count
    FROM courses c LEFT JOIN branches b ON b.id = c.branch_id
    WHERE ${branchWhere('c', bid)}
    ORDER BY c.code
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/courses', requireAdmin, (req, res) => {
  const { code, title, description, instructor, weeks, level } = req.body || {};
  if (!code || !title) return res.status(400).json({ error: 'Course code and title are required' });
  if (db.prepare('SELECT id FROM courses WHERE code = ?').get(code)) {
    return res.status(409).json({ error: 'Course code already exists' });
  }
  const bid = activeBranch(req);
  const result = db.prepare(
    'INSERT INTO courses (code, title, description, instructor, weeks, level, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(code, title, description || '', instructor || '', weeks || 12, level || 'Beginner', bid);
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
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT e.id, e.student_id, e.course_id, e.enrolled_at,
           u.username, u.name AS student_name, c.code AS course_code, c.title AS course_title
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    JOIN courses c ON c.id = e.course_id
    WHERE ${branchWhere('c', bid)}
    ORDER BY e.id DESC
  `).all(...(bid ? [bid] : [])));
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
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT a.*, c.code AS course_code, c.title AS course_title,
      (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submitted_count,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = a.course_id) AS enrolled_count
    FROM assignments a JOIN courses c ON c.id = a.course_id
    WHERE ${branchWhere('c', bid)}
    ORDER BY a.due_date
  `).all(...(bid ? [bid] : [])));
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
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT q.*, c.code AS course_code, c.title AS course_title,
      (SELECT COUNT(*) FROM questions qu WHERE qu.quiz_id = q.id) AS question_count,
      (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id) AS attempt_count
    FROM quizzes q JOIN courses c ON c.id = q.course_id
    WHERE ${branchWhere('c', bid)}
    ORDER BY q.id DESC
  `).all(...(bid ? [bid] : [])));
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
  res.json(builder(activeBranch(req)));
});

// ---------- Admin: attendance ----------
app.get('/api/admin/attendance', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  const dates = db.prepare(`
    SELECT DISTINCT a.date FROM attendance a JOIN courses c ON c.id = a.course_id
    WHERE ${branchWhere('c', bid)}
    ORDER BY a.date DESC
  `).all(...(bid ? [bid] : [])).map(r => r.date);
  const records = db.prepare(`
    SELECT a.id, a.student_id, a.course_id, a.date, a.status,
           u.username, u.name AS student_name, c.code AS course_code, c.title AS course_title
    FROM attendance a
    JOIN users u ON u.id = a.student_id
    JOIN courses c ON c.id = a.course_id
    WHERE ${branchWhere('c', bid)}
    ORDER BY a.date DESC, u.name
  `).all(...(bid ? [bid] : []));
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
  const bid = activeBranch(req);
  const faculty = db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.mobile, u.branch_id,
      (SELECT COUNT(*) FROM faculty_courses fc WHERE fc.faculty_id = u.id) AS course_count
    FROM users u WHERE u.role = 'faculty' AND ${branchWhere('u', bid)}
    ORDER BY u.name
  `).all(...(bid ? [bid] : []));
  const courseFilter = bid ? 'AND c.branch_id = ?' : '';
  const courses = db.prepare(`
    SELECT fc.faculty_id, c.id AS course_id, c.code, c.title
    FROM faculty_courses fc JOIN courses c ON c.id = fc.course_id
    WHERE 1=1 ${courseFilter}
    ORDER BY c.code
  `).all(...(bid ? [bid] : []));
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
    'INSERT INTO users (role, username, password_hash, name, email, mobile, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('faculty', username, bcrypt.hashSync(password, 10), name, email || null, mobile || null, activeBranch(req));
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
  const bid = activeBranch(req);
  const parents = db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.mobile,
      (SELECT COUNT(*) FROM parent_students ps WHERE ps.parent_id = u.id) AS child_count
    FROM users u
    WHERE u.role = 'parent'
      AND EXISTS (
        SELECT 1 FROM parent_students ps JOIN users s ON s.id = ps.student_id
        WHERE ps.parent_id = u.id AND ${branchWhere('s', bid)}
      )
    ORDER BY u.name
  `).all(...(bid ? [bid] : []));
  const links = db.prepare(`
    SELECT ps.parent_id, s.id AS student_id, s.username, s.name AS student_name
    FROM parent_students ps JOIN users s ON s.id = ps.student_id
    WHERE ${branchWhere('s', bid)}
    ORDER BY s.name
  `).all(...(bid ? [bid] : []));
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
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT b.*, c.code AS course_code, c.title AS course_title,
      (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) AS student_count,
      (SELECT COUNT(*) FROM timetable t WHERE t.batch_id = b.id) AS slot_count
    FROM batches b JOIN courses c ON c.id = b.course_id
    WHERE ${branchWhere('c', bid)}
    ORDER BY b.name
  `).all(...(bid ? [bid] : [])));
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
  `).all(batch.course_id, batch.id);  res.json({ batch, students, timetable, availableStudents });
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
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT p.*, u.username, u.name AS student_name
    FROM payments p JOIN users u ON u.id = p.student_id
    WHERE ${branchWhere('p', bid)}
    ORDER BY p.paid_at DESC, p.id DESC
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/payments', requireAdmin, (req, res) => {
  const { student_id, amount, method, note } = req.body || {};
  if (!student_id || amount == null) return res.status(400).json({ error: 'Student and amount are required' });
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(student_id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const receiptNo = 'RCP-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
  const result = db.prepare(
    'INSERT INTO payments (student_id, amount, method, receipt_no, note, branch_id, paid_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
  ).run(student_id, Number(amount), method || 'cash', receiptNo, note || null, student.branch_id || activeBranch(req));
  finance.ensureInstallments(student_id);
  finance.allocatePayment(student_id, Number(amount));
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

// ---------- GST tax invoice for a payment ----------
app.get('/api/admin/payments/:id/invoice', requireAdmin, (req, res) => {
  const payment = db.prepare(`
    SELECT p.*, u.username, u.name AS student_name, u.email, u.mobile, u.fee_amount
    FROM payments p JOIN users u ON u.id = p.student_id WHERE p.id = ?
  `).get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(payment.branch_id);
  if (!branch) return res.status(404).json({ error: 'Branch not found' });

  const courses = db.prepare(`
    SELECT c.code, c.title
    FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE e.student_id = ? ORDER BY c.code
  `).all(payment.student_id);

  const rate = Number(branch.gst_rate) || 18;
  const total = Number(payment.amount) || 0;
  const taxable = Math.round((total / (1 + rate / 100)) * 100) / 100;
  const gst = Math.round((total - taxable) * 100) / 100;
  const cgst = Math.round((gst / 2) * 100) / 100;
  const sgst = Math.round((gst - cgst) * 100) / 100;

  const studentRow = db.prepare('SELECT * FROM users WHERE id = ?').get(payment.student_id);
  const discount = {
    type: studentRow.discount_type || 'none',
    value: Number(studentRow.discount_value) || 0,
    amount: finance.discountAmount(studentRow),
    label: finance.discountLabel(studentRow),
  };

  const year = (payment.paid_at || new Date().toISOString()).slice(0, 4);
  const invoiceNo = 'GST-' + (branch.code || 'BR') + '-' + year + '-' + String(payment.id).padStart(4, '0');

  res.json({
    invoice_no: invoiceNo,
    payment: { id: payment.id, receipt_no: payment.receipt_no, amount: total, method: payment.method, paid_at: payment.paid_at, note: payment.note },
    student: { username: payment.username, name: payment.student_name, email: payment.email, mobile: payment.mobile },
    branch: { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone, email: branch.email, gstin: branch.gstin, gst_rate: rate },
    items: courses,
    discount,
    tax: { rate, taxable, gst, cgst, sgst, total },
  });
});

app.delete('/api/admin/payments/:id', requireAdmin, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  finance.recomputeInstallments(payment.student_id);
  res.json({ ok: true });
});

// ---------- Admin: exams & results ----------
app.get('/api/admin/exams', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT x.*, c.code AS course_code, c.title AS course_title,
      (SELECT COUNT(*) FROM exam_results r WHERE r.exam_id = x.id) AS result_count,
      (SELECT COUNT(*) FROM exam_questions q WHERE q.exam_id = x.id) AS question_count
    FROM exams x JOIN courses c ON c.id = x.course_id
    WHERE ${branchWhere('c', bid)}
    ORDER BY x.exam_date
  `).all(...(bid ? [bid] : [])));
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
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT cert.*, u.username, u.name AS student_name, c.code AS course_code, c.title AS course_title
    FROM certificates cert
    JOIN users u ON u.id = cert.student_id
    JOIN courses c ON c.id = cert.course_id
    WHERE ${branchWhere('c', bid)}
    ORDER BY cert.id DESC
  `).all(...(bid ? [bid] : [])));
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
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT n.*, u.username, u.name AS student_name, u.mobile
    FROM notifications n JOIN users u ON u.id = n.student_id
    WHERE ${branchWhere('u', bid)}
    ORDER BY n.id DESC LIMIT 200
  `).all(...(bid ? [bid] : [])));
});

app.get('/api/admin/notifications/status', requireAdmin, (req, res) => {
  res.json({ configured: notify.isConfigured(), email_configured: email.isConfigured() });
});

app.post('/api/admin/notifications/send', requireAdmin, async (req, res) => {
  const { channel, purpose, student_id, message } = req.body || {};
  if (!student_id || !channel || !purpose) {
    return res.status(400).json({ error: 'Student, channel and purpose are required' });
  }
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(student_id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const msg = message || defaultReminder(student, purpose);
  let result;
  if (channel === 'email') {
    result = await email.sendEmail({ to: student.email, subject: 'Notice from VUMCA hITECH Computing', text: msg });
  } else {
    if (!student.mobile) return res.status(400).json({ error: 'Student has no mobile number' });
    result = await notify.sendReminder({ to: student.mobile, channel, message: msg });
  }
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
    const msg = defaultReminder(s, purpose);
    let result;
    if (channel === 'email') {
      if (!s.email) continue;
      result = await email.sendEmail({ to: s.email, subject: 'Notice from VUMCA hITECH Computing', text: msg });
    } else {
      if (!s.mobile) continue;
      result = await notify.sendReminder({ to: s.mobile, channel: channel || 'sms', message: msg });
    }
    insert.run(s.id, channel === 'email' ? 'email' : (channel || 'sms'), purpose, msg, result.status);
    if (result.status === 'sent') sent += 1;
  }
  res.json({ ok: true, sent });
});

function defaultReminder(student, purpose) {
  const name = student.name.split(' ')[0];
  if (purpose === 'fee') {
    const snap = finance.feeSnapshot(student.id);
    if (snap && snap.pending > 0) {
      let due = '';
      if (snap.next_due && snap.next_due.due_date) {
        due = ` Next installment "${snap.next_due.label}" of Rs. ${snap.next_due.amount} is due on ${snap.next_due.due_date}.`;
      }
      return `Hi ${name}, your fee balance is Rs. ${snap.pending}.${due} Please contact the office. - VUMCA hITECH Computing`;
    }
    return `Hi ${name}, your fee has been cleared. - VUMCA hITECH Computing`;
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
  const snap = finance.feeSnapshot(req.session.user.id);
  const payments = db.prepare(`
    SELECT p.* FROM payments p WHERE p.student_id = ? ORDER BY p.paid_at DESC
  `).all(req.session.user.id);
  res.json({ ...snap, payments });
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
    fee: finance.feeSnapshot(childId),
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
    const pending = finance.pendingAmount(studentId);
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
      "INSERT INTO payments (student_id, amount, method, receipt_no, note, branch_id, paid_at) VALUES (?, ?, 'razorpay', ?, 'Online payment (Razorpay)', ?, datetime('now'))"
    ).run(studentId, amount, receiptNo, student.branch_id || activeBranch(req));
    finance.ensureInstallments(studentId);
    finance.allocatePayment(studentId, amount);
    const cleared = finance.pendingAmount(studentId) <= 0.005;

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

// =====================================================================
// ============ AUTO FEE REMINDERS + BACKUP/RESTORE + NOTICES ===========
// =====================================================================

app.get('/api/admin/reminders/status', requireAdmin, (req, res) => {
  res.json(reminders.status());
});

app.post('/api/admin/reminders/run-now', requireAdmin, async (req, res) => {
  try {
    const result = await reminders.run();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/reminders/log', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT r.*, u.name AS student_name, u.username
    FROM reminders r JOIN users u ON u.id = r.student_id
    WHERE ${branchWhere('u', bid)}
    ORDER BY r.id DESC LIMIT 100
  `).all(...(bid ? [bid] : [])));
});

const DB_FILE = path.join(__dirname, '..', 'data', 'lms.db');

app.get('/api/admin/backup', requireAdmin, (req, res) => {
  if (!fs.existsSync(DB_FILE)) return res.status(404).json({ error: 'Database file not found' });
  try { db.checkpoint(); } catch (_) {}
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.download(DB_FILE, `vumca-backup-${stamp}.db`);
});

app.post('/api/admin/restore', requireAdmin, (req, res) => {
  try {
    const { data } = req.body || {};
    if (!data) return res.status(400).json({ error: 'No backup data provided' });
    const buf = Buffer.from(data, 'base64');
    if (buf.length < 1000) return res.status(400).json({ error: 'Backup file too small or invalid' });
    const tmp = path.join(__dirname, '..', 'data', 'restore-upload-' + Date.now() + '.db');
    fs.writeFileSync(tmp, buf);
    const result = db.replaceDatabase(tmp);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- Notices ----------
app.get('/api/admin/notices', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT n.*, b.name AS branch_name FROM notices n
    LEFT JOIN branches b ON b.id = n.branch_id
    WHERE ${branchWhere('n', bid)}
    ORDER BY n.publish_date DESC
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/notices', requireAdmin, (req, res) => {
  const { title, body, publish_date, expires_on } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const result = db.prepare(
    'INSERT INTO notices (branch_id, title, body, publish_date, expires_on) VALUES (?, ?, ?, ?, ?)'
  ).run(activeBranch(req), title, body || null, publish_date || null, expires_on || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/notices/:id', requireAdmin, (req, res) => {
  const notice = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });
  const { title, body, publish_date, expires_on } = req.body || {};
  db.prepare('UPDATE notices SET title = ?, body = ?, publish_date = ?, expires_on = ? WHERE id = ?')
    .run(
      title ?? notice.title,
      body !== undefined ? body : notice.body,
      publish_date !== undefined ? (publish_date || null) : notice.publish_date,
      expires_on !== undefined ? (expires_on || null) : notice.expires_on,
      notice.id
    );
  res.json({ ok: true });
});

app.delete('/api/admin/notices/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM notices WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Notice not found' });
  res.json({ ok: true });
});

// ---------- Vendors (GST input credit) ----------
app.get('/api/admin/vendors', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT v.*, (SELECT COALESCE(SUM(p.amount),0) FROM vendor_purchases p WHERE p.vendor_id = v.id) AS total_purchases
    FROM vendors v WHERE ${branchWhere('v', bid)} ORDER BY v.name
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/vendors', requireAdmin, (req, res) => {
  const { name, phone, email, gstin, address, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Vendor name is required' });
  const result = db.prepare(
    'INSERT INTO vendors (branch_id, name, phone, email, gstin, address, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(activeBranch(req), name, phone || null, email || null, gstin || null, address || null, status || 'active');
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/vendors/:id', requireAdmin, (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  const { name, phone, email, gstin, address, status } = req.body || {};
  db.prepare('UPDATE vendors SET name = ?, phone = ?, email = ?, gstin = ?, address = ?, status = ? WHERE id = ?')
    .run(
      name ?? vendor.name,
      phone !== undefined ? phone : vendor.phone,
      email !== undefined ? email : vendor.email,
      gstin !== undefined ? gstin : vendor.gstin,
      address !== undefined ? address : vendor.address,
      status ?? vendor.status,
      vendor.id
    );
  res.json({ ok: true });
});

app.delete('/api/admin/vendors/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Vendor not found' });
  res.json({ ok: true });
});

// ---------- Vendor purchases (input credit) ----------
app.get('/api/admin/vendor-purchases', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT p.*, v.name AS vendor_name, v.gstin AS vendor_gstin
    FROM vendor_purchases p LEFT JOIN vendors v ON v.id = p.vendor_id
    WHERE ${branchWhere('p', bid)} ORDER BY p.bill_date DESC
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/vendor-purchases', requireAdmin, (req, res) => {
  const { vendor_id, bill_no, bill_date, amount, gst_rate, category, note } = req.body || {};
  if (!vendor_id || amount == null) return res.status(400).json({ error: 'Vendor and amount are required' });
  const rate = Number(gst_rate) || 18;
  const amt = Number(amount) || 0;
  const inputCredit = Math.round((amt - amt / (1 + rate / 100)) * 100) / 100;
  const result = db.prepare(
    'INSERT INTO vendor_purchases (branch_id, vendor_id, bill_no, bill_date, amount, gst_rate, input_credit, category, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(activeBranch(req), vendor_id, bill_no || null, bill_date || null, amt, rate, inputCredit, category || null, note || null);
  res.status(201).json({ id: result.lastInsertRowid, input_credit: inputCredit });
});

app.delete('/api/admin/vendor-purchases/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM vendor_purchases WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Purchase not found' });
  res.json({ ok: true });
});

// ---------- Assets ----------
app.get('/api/admin/assets', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`SELECT * FROM assets WHERE ${branchWhere('assets', bid)} ORDER BY id DESC`)
    .all(...(bid ? [bid] : [])));
});

app.post('/api/admin/assets', requireAdmin, (req, res) => {
  const { name, category, tag_no, cost, purchase_date, status, note } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Asset name is required' });
  const result = db.prepare(
    'INSERT INTO assets (branch_id, name, category, tag_no, cost, purchase_date, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(activeBranch(req), name, category || null, tag_no || null, Number(cost) || 0, purchase_date || null, status || 'in-use', note || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/assets/:id', requireAdmin, (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const { name, category, tag_no, cost, purchase_date, status, note } = req.body || {};
  db.prepare('UPDATE assets SET name = ?, category = ?, tag_no = ?, cost = ?, purchase_date = ?, status = ?, note = ? WHERE id = ?')
    .run(
      name ?? asset.name,
      category !== undefined ? category : asset.category,
      tag_no !== undefined ? tag_no : asset.tag_no,
      cost != null ? Number(cost) : asset.cost,
      purchase_date !== undefined ? purchase_date : asset.purchase_date,
      status ?? asset.status,
      note !== undefined ? note : asset.note,
      asset.id
    );
  res.json({ ok: true });
});

app.delete('/api/admin/assets/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Asset not found' });
  res.json({ ok: true });
});

// ---------- GST summary (output invoice GST vs input credit) ----------
app.get('/api/admin/gst-summary', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  const period = req.query.month || new Date().toISOString().slice(0, 7);

  const payments = db.prepare(`
    SELECT p.*, b.gst_rate AS rate FROM payments p
    LEFT JOIN branches b ON b.id = p.branch_id
    WHERE ${branchWhere('p', bid)} AND substr(p.paid_at, 1, 7) = ?
  `).all(...(bid ? [bid] : []), period);

  let taxable = 0, outputGst = 0, count = 0;
  const byRate = {};
  for (const p of payments) {
    const rate = Number(p.rate) || 18;
    const t = Math.round((Number(p.amount) / (1 + rate / 100)) * 100) / 100;
    const g = Math.round((Number(p.amount) - t) * 100) / 100;
    taxable += t; outputGst += g; count += 1;
    byRate[rate] = (byRate[rate] || 0) + g;
  }

  const purchases = db.prepare(`
    SELECT * FROM vendor_purchases WHERE ${branchWhere('vendor_purchases', bid)} AND substr(bill_date, 1, 7) = ?
  `).all(...(bid ? [bid] : []), period);
  const inputGst = purchases.reduce((s, p) => s + (Number(p.input_credit) || 0), 0);

  const netPayable = Math.round((outputGst - inputGst) * 100) / 100;

  res.json({
    period,
    output: { invoices: count, taxable_value: Math.round(taxable * 100) / 100, gst: Math.round(outputGst * 100) / 100, by_rate: byRate },
    input: { bills: purchases.length, input_credit: Math.round(inputGst * 100) / 100 },
    net_payable: netPayable,
  });
});

// ---------- Enquiry -> Student conversion ----------
app.post('/api/admin/enquiries/:id/convert', requireAdmin, (req, res) => {
  const enquiry = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(req.params.id);
  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
  if (enquiry.status === 'enrolled') return res.status(400).json({ error: 'Enquiry is already converted' });

  let seq = 0;
  const last = db.prepare("SELECT username FROM users WHERE role = 'student' AND username LIKE 'STU%' ORDER BY username DESC LIMIT 1").get();
  if (last) {
    seq = Number(String(last.username).replace(/\D/g, '')) || 0;
  }
  const username = 'STU' + String(seq + 1).padStart(3, '0');
  const password = 'student' + String(seq + 1);

  const bid = enquiry.branch_id || activeBranch(req);
  const studentId = db.prepare(
    'INSERT INTO users (role, username, password_hash, name, email, mobile, fee_amount, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('student', username, bcrypt.hashSync(password, 10), enquiry.name, enquiry.email || null, enquiry.phone || null, 0, bid).lastInsertRowid;

  if (enquiry.course_id) {
    try {
      db.prepare('INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)').run(studentId, enquiry.course_id);
    } catch (_) {}
  }

  db.prepare('UPDATE enquiries SET status = ?, followup_date = NULL, notes = COALESCE(notes, ?) || ? WHERE id = ?')
    .run('enrolled', '', ` Converted to student ${username} (${password}).`, enquiry.id);

  res.status(201).json({ id: studentId, username, password });
});

// ---------- Report card + ID card ----------
function gradeFor(pct) {
  if (pct == null) return null;
  if (pct >= 90) return 'A+';
  if (pct >= 75) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 45) return 'C';
  if (pct >= 35) return 'D';
  return 'F';
}

function buildReportCard(studentId) {
  const student = db.prepare(`
    SELECT u.*, b.name AS branch_name, b.code AS branch_code FROM users u
    LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = ?
  `).get(studentId);
  if (!student) return null;

  const courses = db.prepare(`
    SELECT c.id, c.code, c.title, c.instructor FROM enrollments e
    JOIN courses c ON c.id = e.course_id WHERE e.student_id = ? ORDER BY c.code
  `).all(studentId);

  const rows = courses.map(c => {
    const exams = db.prepare(`
      SELECT x.title, x.exam_date, x.max_marks, r.marks
      FROM exams x LEFT JOIN exam_results r ON r.exam_id = x.id AND r.student_id = ?
      WHERE x.course_id = ? ORDER BY x.exam_date
    `).all(studentId, c.id).map(e => ({
      ...e, pct: e.max_marks ? Math.round((e.marks / e.max_marks) * 100) : 0,
    }));

    const att = db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present
      FROM attendance WHERE student_id = ? AND course_id = ?
    `).get(studentId, c.id);
    const attPct = att.total ? Math.round((att.present / att.total) * 100) : null;

    const graded = exams.filter(e => e.marks != null);
    const examAvg = graded.length ? Math.round(graded.reduce((s, e) => s + e.pct, 0) / graded.length) : null;

    const assignments = db.prepare(`
      SELECT a.title, a.max_score, s.score, s.submitted_at
      FROM assignments a LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
      WHERE a.course_id = ? ORDER BY a.due_date
    `).all(studentId, c.id);

    const metric = examAvg != null ? examAvg : attPct;
    return {
      ...c,
      exams,
      attendance: { total: att.total, present: att.present || 0, pct: attPct },
      exam_avg: examAvg,
      assignments,
      grade: gradeFor(metric),
      remark: metric == null ? '—' : `${metric}%`,
    };
  });

  const graded = rows.filter(r => r.grade && r.grade !== 'F');
  const overall = graded.length ? Math.round(graded.reduce((s, r) => s + Number(r.remark.replace('%', '')), 0) / graded.length) : null;

  return {
    student: { username: student.username, name: student.name, mobile: student.mobile, branch_name: student.branch_name, branch_code: student.branch_code },
    courses: rows,
    overall: overall == null ? null : { pct: overall, grade: gradeFor(overall) },
    generated_on: new Date().toISOString().slice(0, 10),
  };
}

function buildIdCard(studentId) {
  const student = db.prepare(`
    SELECT u.*, b.name AS branch_name, b.address AS branch_address FROM users u
    LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = ?
  `).get(studentId);
  if (!student) return null;
  const courses = db.prepare(`
    SELECT c.code, c.title FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE e.student_id = ? ORDER BY c.code
  `).all(studentId);
  const valid = new Date();
  valid.setFullYear(valid.getFullYear() + 1);
  return {
    student: { username: student.username, name: student.name, mobile: student.mobile, branch_name: student.branch_name, branch_address: student.branch_address },
    courses,
    valid_until: valid.toISOString().slice(0, 10),
    issued_on: new Date().toISOString().slice(0, 10),
  };
}

app.get('/api/admin/students/:id/reportcard', requireAdmin, (req, res) => {
  const card = buildReportCard(Number(req.params.id));
  if (!card) return res.status(404).json({ error: 'Student not found' });
  res.json(card);
});

app.get('/api/admin/students/:id/idcard', requireAdmin, (req, res) => {
  const card = buildIdCard(Number(req.params.id));
  if (!card) return res.status(404).json({ error: 'Student not found' });
  res.json(card);
});

app.get('/api/student/reportcard', requireStudent, (req, res) => {
  const card = buildReportCard(req.session.user.id);
  if (!card) return res.status(404).json({ error: 'Student not found' });
  res.json(card);
});

app.get('/api/student/idcard', requireStudent, (req, res) => {
  const card = buildIdCard(req.session.user.id);
  if (!card) return res.status(404).json({ error: 'Student not found' });
  res.json(card);
});

app.get('/api/parent/children/:id/reportcard', requireParent, (req, res) => {
  const childId = Number(req.params.id);
  const linked = db.prepare('SELECT id FROM parent_students WHERE parent_id = ? AND student_id = ?').get(req.session.user.id, childId);
  if (!linked) return res.status(403).json({ error: 'Not linked to this student' });
  const card = buildReportCard(childId);
  if (!card) return res.status(404).json({ error: 'Student not found' });
  res.json(card);
});

app.get('/api/parent/children/:id/idcard', requireParent, (req, res) => {
  const childId = Number(req.params.id);
  const linked = db.prepare('SELECT id FROM parent_students WHERE parent_id = ? AND student_id = ?').get(req.session.user.id, childId);
  if (!linked) return res.status(403).json({ error: 'Not linked to this student' });
  const card = buildIdCard(childId);
  if (!card) return res.status(404).json({ error: 'Student not found' });
  res.json(card);
});

// ---------- Notices for students/parents ----------
app.get('/api/student/notices', requireStudent, (req, res) => {
  const s = db.prepare('SELECT branch_id FROM users WHERE id = ?').get(req.session.user.id);
  const rows = db.prepare(`
    SELECT n.id, n.title, n.body, n.publish_date, n.expires_on
    FROM notices n WHERE (n.branch_id IS NULL OR n.branch_id = ?) AND (n.expires_on IS NULL OR n.expires_on >= date('now'))
    ORDER BY n.publish_date DESC
  `).all(s ? s.branch_id : null);
  res.json(rows);
});

app.get('/api/parent/notices', requireParent, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT n.id, n.title, n.body, n.publish_date, n.expires_on
    FROM notices n
    JOIN parent_students ps ON 1=1
    JOIN users s ON s.id = ps.student_id
    WHERE ps.parent_id = ? AND (n.branch_id IS NULL OR n.branch_id = s.branch_id)
      AND (n.expires_on IS NULL OR n.expires_on >= date('now'))
    ORDER BY n.publish_date DESC
  `).all(req.session.user.id);
  res.json(rows);
});

// ---------- Student: library ----------
app.get('/api/student/library', requireStudent, (req, res) => {
  const books = db.prepare(`
    SELECT b.* FROM books b
    WHERE ${branchWhere('b', req.session.user.branch_id)} AND b.available > 0
    ORDER BY b.title
  `).all(...(req.session.user.branch_id ? [req.session.user.branch_id] : []));
  const loans = db.prepare(`
    SELECT l.*, b.title AS book_title, b.author
    FROM library_loans l JOIN books b ON b.id = l.book_id
    WHERE l.student_id = ? ORDER BY l.issue_date DESC
  `).all(req.session.user.id);
  res.json({ books, loans });
});

app.get('/api/student/library/issued', requireStudent, (req, res) => {
  res.json(db.prepare(`
    SELECT l.*, b.title AS book_title, b.author
    FROM library_loans l JOIN books b ON b.id = l.book_id
    WHERE l.student_id = ? AND l.status = 'issued' ORDER BY l.due_date
  `).all(req.session.user.id));
});

// ---------- Student: transport ----------
app.get('/api/student/transport', requireStudent, (req, res) => {
  const row = db.prepare(`
    SELECT rs.*, r.name AS route_name, r.vehicle_no, r.driver_name, r.driver_phone, r.fee_monthly
    FROM route_students rs JOIN routes r ON r.id = rs.route_id
    WHERE rs.student_id = ? AND r.status = 'active'
  `).all(req.session.user.id);
  res.json(row);
});

// ---------- Faculty: leave management ----------
app.get('/api/faculty/leaves', requireFaculty, (req, res) => {
  res.json(db.prepare(`
    SELECT * FROM leaves WHERE employee_type = 'faculty' AND employee_id = ? ORDER BY applied_on DESC
  `).all(req.session.user.id));
});

app.post('/api/faculty/leaves', requireFaculty, (req, res) => {
  const { leave_type, reason, start_date, end_date } = req.body || {};
  if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end dates are required' });
  if (start_date > end_date) return res.status(400).json({ error: 'Start date must be before end date' });
  const start = new Date(start_date + 'T00:00:00');
  const end = new Date(end_date + 'T00:00:00');
  const days = Math.round((end - start) / 86400000) + 1;
  if (days > 30) return res.status(400).json({ error: 'Leave cannot exceed 30 days' });
  const result = db.prepare(
    `INSERT INTO leaves (employee_type, employee_id, employee_name, leave_type, reason, start_date, end_date, days, status)
     VALUES ('faculty', ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).run(req.session.user.id, req.session.user.name, leave_type || 'casual', reason || '', start_date, end_date, days);
  res.status(201).json({ id: result.lastInsertRowid });
});

// ---------- Staff: leave (apply/status via admin account is used for approvals) ----------
// Staff leave applications come through the admin console (staff are not portal users).

// ---------- Online admission (public, no auth) ----------
app.get('/api/public/courses', (req, res) => {
  res.json(db.prepare('SELECT c.id, c.code, c.title, c.weeks AS duration, c.level FROM courses c ORDER BY c.title').all());
});

app.post('/api/public/admission', (req, res) => {
  const { name, phone, email, course_id, message } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
  const first = db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
  const result = db.prepare(
    'INSERT INTO enquiries (branch_id, name, phone, email, course_id, source, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(first ? first.id : null, name, phone, email || null, course_id || null, 'Website', 'new', message || null);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Application received. Our team will contact you shortly.' });
});

// ---------- Dashboard charts (admin) ----------
app.get('/api/admin/dashboard/charts', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  const w = (alias) => branchWhere(alias, bid);
  const a = bid ? [bid] : [];

  const revenueByMonth = db.prepare(`
    SELECT substr(paid_at, 1, 7) AS month, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
    FROM payments WHERE ${w('payments')} AND paid_at IS NOT NULL
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all(...a).reverse();

  const feeStatus = db.prepare(`
    SELECT u.id FROM users u WHERE u.role = 'student' AND ${w('u')}
  `).all(...a);
  let paid = 0, pending = 0, overdue = 0;
  for (const s of feeStatus) {
    const snap = finance.feeSnapshot(s.id);
    if (!snap) continue;
    if (snap.pending <= 0.005) paid += 1;
    else if (snap.overdue_count > 0) overdue += 1;
    else pending += 1;
  }

  const enquiries = db.prepare(`
    SELECT status, COUNT(*) AS count FROM enquiries WHERE ${w('enquiries')} GROUP BY status
  `).all(...a);

  const topCourses = db.prepare(`
    SELECT c.title, COUNT(e.id) AS students
    FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id
    WHERE ${w('c')} GROUP BY c.id ORDER BY students DESC LIMIT 5
  `).all(...a);

  res.json({ revenue_by_month: revenueByMonth, fee_status: { paid, pending, overdue }, enquiries, top_courses: topCourses });
});

// =====================================================================
// ============ BROADCASTS, LIBRARY, TRANSPORT, LEAVES, IMPORTS =========
// =====================================================================

// ---------- Bulk broadcasts ----------
app.get('/api/admin/broadcasts', requireAdmin, (req, res) => {
  res.json(broadcasts.list());
});

app.post('/api/admin/broadcasts', requireAdmin, async (req, res) => {
  const { title, message, channel, audience, branch_id, student_ids } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message is required' });
  const summary = await broadcasts.run({
    title, message, channel: channel || 'whatsapp', audience: audience || 'all',
    branch_id: audience === 'branch' ? branch_id || activeBranch(req) : null,
    student_ids, created_by: req.session.user.username,
  });
  res.status(201).json(summary);
});

app.get('/api/admin/broadcasts/:id/recipients', requireAdmin, (req, res) => {
  res.json(broadcasts.recipients(req.params.id));
});

// ---------- Library ----------
app.get('/api/admin/books', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM library_loans l WHERE l.book_id = b.id AND l.status = 'issued') AS issued_count
    FROM books b WHERE ${branchWhere('b', bid)} ORDER BY b.title
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/books', requireAdmin, (req, res) => {
  const { title, author, isbn, category, quantity } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Book title is required' });
  const qty = Math.max(0, Number(quantity) || 1);
  const bid = activeBranch(req);
  const result = db.prepare(
    'INSERT INTO books (branch_id, title, author, isbn, category, quantity, available) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(bid, title, author || '', isbn || '', category || 'General', qty, qty);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/books/:id', requireAdmin, (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const { title, author, isbn, category, quantity } = req.body || {};
  const qty = quantity != null ? Math.max(0, Number(quantity)) : book.quantity;
  const issued = db.prepare("SELECT COUNT(*) AS c FROM library_loans WHERE book_id = ? AND status = 'issued'").get(book.id).c;
  db.prepare('UPDATE books SET title = ?, author = ?, isbn = ?, category = ?, quantity = ?, available = ? WHERE id = ?')
    .run(title || book.title, author ?? book.author, isbn ?? book.isbn, category || book.category, qty, Math.max(0, qty - issued), book.id);
  res.json({ ok: true });
});

app.delete('/api/admin/books/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/library/loans', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT l.*, b.title AS book_title, u.name AS student_name, u.username
    FROM library_loans l
    JOIN books b ON b.id = l.book_id
    JOIN users u ON u.id = l.student_id
    WHERE ${branchWhere('b', bid)}
    ORDER BY l.issue_date DESC, l.id DESC
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/library/loans', requireAdmin, (req, res) => {
  const { book_id, student_id, due_date } = req.body || {};
  if (!book_id || !student_id) return res.status(400).json({ error: 'Book and student are required' });
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(book_id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const available = Number(book.available) || 0;
  if (available <= 0) return res.status(400).json({ error: 'No copies available for issue' });
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(student_id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const existing = db.prepare("SELECT id FROM library_loans WHERE book_id = ? AND student_id = ? AND status = 'issued'").get(book_id, student_id);
  if (existing) return res.status(400).json({ error: 'Student already has this book issued' });
  const d = due_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const result = db.prepare(
    'INSERT INTO library_loans (book_id, student_id, issue_date, due_date, status) VALUES (?, ?, date(\'now\'), ?, \'issued\')'
  ).run(book_id, student_id, d);
  db.prepare('UPDATE books SET available = available - 1 WHERE id = ?').run(book_id);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.post('/api/admin/library/loans/:id/return', requireAdmin, (req, res) => {
  const loan = db.prepare("SELECT * FROM library_loans WHERE id = ? AND status = 'issued'").get(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Active loan not found' });
  const overdue = Math.max(0, Math.round((Date.now() - new Date(loan.due_date + 'T00:00:00')) / 86400000));
  const fine = overdue > 0 ? Math.round(overdue * 5 * 100) / 100 : 0;
  db.prepare("UPDATE library_loans SET status = 'returned', return_date = date('now'), fine = ? WHERE id = ?").run(fine, loan.id);
  db.prepare('UPDATE books SET available = available + 1 WHERE id = ?').run(loan.book_id);
  res.json({ ok: true, fine });
});

// ---------- Transport ----------
app.get('/api/admin/routes', requireAdmin, (req, res) => {
  const bid = activeBranch(req);
  res.json(db.prepare(`
    SELECT r.*, b.name AS branch_name,
      (SELECT COUNT(*) FROM route_students rs WHERE rs.route_id = r.id) AS student_count
    FROM routes r JOIN branches b ON b.id = r.branch_id
    WHERE ${branchWhere('r', bid)} ORDER BY r.name
  `).all(...(bid ? [bid] : [])));
});

app.post('/api/admin/routes', requireAdmin, (req, res) => {
  const { name, vehicle_no, driver_name, driver_phone, fee_monthly, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Route name is required' });
  const bid = activeBranch(req);
  const result = db.prepare(
    'INSERT INTO routes (branch_id, name, vehicle_no, driver_name, driver_phone, fee_monthly, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(bid, name, vehicle_no || '', driver_name || '', driver_phone || '', Number(fee_monthly) || 0, status || 'active');
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/routes/:id', requireAdmin, (req, res) => {
  const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(req.params.id);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  const { name, vehicle_no, driver_name, driver_phone, fee_monthly, status } = req.body || {};
  db.prepare('UPDATE routes SET name = ?, vehicle_no = ?, driver_name = ?, driver_phone = ?, fee_monthly = ?, status = ? WHERE id = ?')
    .run(name || route.name, vehicle_no ?? route.vehicle_no, driver_name ?? route.driver_name,
         driver_phone ?? route.driver_phone, fee_monthly != null ? Number(fee_monthly) : route.fee_monthly,
         status || route.status, route.id);
  res.json({ ok: true });
});

app.delete('/api/admin/routes/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM routes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/routes/:id/students', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT rs.*, u.name AS student_name, u.username, u.mobile
    FROM route_students rs JOIN users u ON u.id = rs.student_id
    WHERE rs.route_id = ? ORDER BY rs.boarding_time
  `).all(req.params.id));
});

app.post('/api/admin/routes/:id/students', requireAdmin, (req, res) => {
  const { student_id, stop_name, boarding_time } = req.body || {};
  if (!student_id) return res.status(400).json({ error: 'Student is required' });
  const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(req.params.id);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  const dup = db.prepare('SELECT id FROM route_students WHERE route_id = ? AND student_id = ?').get(route.id, student_id);
  if (dup) return res.status(400).json({ error: 'Student is already on this route' });
  db.prepare('INSERT INTO route_students (route_id, student_id, stop_name, boarding_time) VALUES (?, ?, ?, ?)')
    .run(route.id, student_id, stop_name || '', boarding_time || '');
  res.status(201).json({ ok: true });
});

app.delete('/api/admin/routes/:id/students/:sid', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM route_students WHERE route_id = ? AND student_id = ?').run(req.params.id, req.params.sid);
  res.json({ ok: true });
});

// ---------- Leaves ----------
app.get('/api/admin/leaves', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM leaves ORDER BY applied_on DESC, id DESC LIMIT 200').all());
});

app.get('/api/admin/leaves/calendar', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT l.*, CASE WHEN l.employee_type = 'staff' THEN s.role ELSE 'Faculty' END AS employee_role
    FROM leaves l
    LEFT JOIN staff s ON l.employee_type = 'staff' AND s.id = l.employee_id
    WHERE l.status = 'approved'
    ORDER BY l.start_date
  `).all());
});

app.post('/api/admin/leaves/:id/review', requireAdmin, (req, res) => {
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ? AND status = \'pending\'').get(req.params.id);
  if (!leave) return res.status(404).json({ error: 'Pending leave not found' });
  const { status, note } = req.body || {};
  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }
  db.prepare('UPDATE leaves SET status = ?, note = ?, reviewed_by = ?, reviewed_on = datetime(\'now\') WHERE id = ?')
    .run(status, note || leave.note, req.session.user.username, leave.id);
  // Approved staff leave is reflected in the attendance ledger so payroll sees it.
  if (status === 'approved' && leave.employee_type === 'staff') {
    const addLeave = db.prepare('INSERT OR IGNORE INTO staff_attendance (staff_id, date, status) VALUES (?, ?, \'leave\')');
    const start = new Date(leave.start_date + 'T00:00:00');
    const end = new Date(leave.end_date + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      addLeave.run(leave.employee_id, d.toISOString().slice(0, 10));
    }
  }
  res.json({ ok: true });
});

// ---------- Bulk CSV imports ----------
app.post('/api/admin/students/import', requireAdmin, (req, res) => {
  const rows = (req.body || {}).rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No rows to import' });
  }
  const bid = activeBranch(req);
  const insert = db.prepare(
    'INSERT INTO users (role, username, password_hash, name, email, mobile, fee_amount, fee_paid, branch_id, discount_type, discount_value, fee_installments, fee_start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  let created = 0;
  const errors = [];
  for (const r of rows) {
    const name = String(r.name || '').trim();
    const email = String(r.email || '').trim();
    const mobile = String(r.mobile || '').trim();
    const fee = Number(r.fee_amount) || 0;
    const feePaid = String(r.fee_paid || '').toLowerCase() === 'yes' || r.fee_paid === 1 || r.fee_paid === '1';
    if (!name) { errors.push({ row: name || '(unnamed)', error: 'Missing name' }); continue; }
    const base = String(r.username || '').trim() || ('STU' + String(Date.now()).slice(-6));
    let username = base;
    let n = 2;
    while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) username = `${base}${n++}`;
    const pass = String(r.password || '').trim() || 'student123';
    const result = insert.run('student', username, bcrypt.hashSync(pass, 10), name, email || null, mobile || null,
      fee, feePaid ? 1 : 0, bid, 'none', 0,
      Number(r.fee_installments) > 1 ? Number(r.fee_installments) : 1, r.fee_start_date || null);
    finance.ensureInstallments(result.lastInsertRowid);
    finance.refreshFeeStatus(result.lastInsertRowid);
    created += 1;
  }
  res.status(201).json({ created, errors });
});

app.post('/api/admin/enquiries/import', requireAdmin, (req, res) => {
  const rows = (req.body || {}).rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No rows to import' });
  }
  const bid = activeBranch(req);
  const insert = db.prepare(
    'INSERT INTO enquiries (branch_id, name, phone, email, course_id, source, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const courseByCode = {};
  for (const c of db.prepare('SELECT id, code, title FROM courses').all()) {
    courseByCode[c.code.toLowerCase()] = c.id;
    courseByCode[c.title.toLowerCase()] = c.id;
  }
  let created = 0;
  const errors = [];
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (!name) { errors.push({ row: name || '(unnamed)', error: 'Missing name' }); continue; }
    const courseKey = String(r.course || '').trim().toLowerCase();
    const courseId = courseByCode[courseKey] || null;
    const validStatus = ['new', 'contacted', 'follow-up', 'enrolled', 'lost'];
    const status = validStatus.includes(String(r.status || '').trim().toLowerCase())
      ? String(r.status).trim().toLowerCase() : 'new';
    insert.run(bid, name, String(r.phone || '').trim() || null, String(r.email || '').trim() || null,
      courseId, String(r.source || '').trim() || 'Import', status, String(r.notes || '').trim() || null);
    created += 1;
  }
  res.status(201).json({ created, errors });
});

app.listen(PORT, () => {
  console.log(`VUMCA LMS running on http://localhost:${PORT}`);
});

reminders.schedule();
