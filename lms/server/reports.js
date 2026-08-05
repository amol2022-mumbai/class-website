// Report builders. Each returns a tabular structure the frontend can render
// generically and export to CSV: { title, summary, columns, rows }.
const db = require('./db');

const pct = (num, den) => (den ? Math.round((num / den) * 100) : 0);

function studentsReport() {
  const rows = db.prepare(`
    SELECT u.username, u.name, u.email, u.mobile, u.fee_amount, u.fee_paid,
      (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id) AS course_count,
      (SELECT COUNT(*) FROM attendance a WHERE a.student_id = u.id AND a.status = 'present') AS present_days,
      (SELECT COUNT(*) FROM attendance a WHERE a.student_id = u.id) AS total_days
    FROM users u WHERE u.role = 'student' ORDER BY u.name
  `).all();
  return {
    title: 'Student Master Report',
    summary: [
      { label: 'Total Students', value: rows.length },
      { label: 'Fees Paid', value: rows.filter(r => r.fee_paid).length },
      { label: 'Fees Pending', value: rows.filter(r => !r.fee_paid).length },
    ],
    columns: ['Student ID', 'Name', 'Email', 'Mobile', 'Fee Amount', 'Fee Paid', 'Courses', 'Present Days', 'Attendance %'],
    rows: rows.map(r => [
      r.username, r.name, r.email || '—', r.mobile || '—', r.fee_amount, r.fee_paid ? 'Yes' : 'No',
      r.course_count, r.present_days, pct(r.present_days, r.total_days) + '%',
    ]),
  };
}

function feesReport() {
  const rows = db.prepare(`
    SELECT u.username, u.name, u.fee_amount, u.fee_paid FROM users u
    WHERE u.role = 'student' ORDER BY u.name
  `).all();
  const total = rows.reduce((s, r) => s + (r.fee_amount || 0), 0);
  const collected = rows.filter(r => r.fee_paid).reduce((s, r) => s + (r.fee_amount || 0), 0);
  const pending = total - collected;
  return {
    title: 'Fee Collection Report',
    summary: [
      { label: 'Total Fees', value: formatMoney(total) },
      { label: 'Collected', value: formatMoney(collected) },
      { label: 'Pending', value: formatMoney(pending) },
      { label: 'Paid Students', value: rows.filter(r => r.fee_paid).length },
      { label: 'Pending Students', value: rows.filter(r => !r.fee_paid).length },
    ],
    columns: ['Student ID', 'Name', 'Fee Amount', 'Status', 'Pending Amount'],
    rows: rows.map(r => [
      r.username, r.name, formatMoney(r.fee_amount),
      r.fee_paid ? 'PAID' : 'PENDING',
      r.fee_paid ? 0 : r.fee_amount,
    ]),
  };
}

function attendanceReport() {
  const rows = db.prepare(`
    SELECT u.username, u.name,
      SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late,
      SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
      COUNT(a.id) AS total
    FROM users u LEFT JOIN attendance a ON a.student_id = u.id
    WHERE u.role = 'student'
    GROUP BY u.id ORDER BY u.name
  `).all();
  return {
    title: 'Attendance Report',
    summary: [
      { label: 'Students', value: rows.length },
      { label: 'Present', value: rows.reduce((s, r) => s + r.present, 0) },
      { label: 'Late', value: rows.reduce((s, r) => s + r.late, 0) },
      { label: 'Absent', value: rows.reduce((s, r) => s + r.absent, 0) },
    ],
    columns: ['Student ID', 'Name', 'Present', 'Late', 'Absent', 'Total Days', 'Attendance %'],
    rows: rows.map(r => [r.username, r.name, r.present, r.late, r.absent, r.total, pct(r.present + r.late, r.total) + '%']),
  };
}

function gradesReport() {
  const rows = db.prepare(`
    SELECT u.username, u.name, c.code AS course_code, a.title AS assignment,
           s.score, a.max_score
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.score IS NOT NULL
    ORDER BY u.name, a.due_date
  `).all();
  return {
    title: 'Assignment Grades Report',
    summary: [
      { label: 'Graded Submissions', value: rows.length },
      { label: 'Avg Score', value: rows.length ? pct(rows.reduce((s, r) => s + r.score, 0), rows.length) + '%' : '—' },
    ],
    columns: ['Student ID', 'Name', 'Course', 'Assignment', 'Score', 'Max Score', 'Percentage'],
    rows: rows.map(r => [r.username, r.name, r.course_code, r.assignment, r.score, r.max_score, pct(r.score, r.max_score) + '%']),
  };
}

function quizzesReport() {
  const rows = db.prepare(`
    SELECT u.username, u.name, c.code AS course_code, q.title AS quiz, qa.score, qa.total
    FROM quiz_attempts qa
    JOIN users u ON u.id = qa.student_id
    JOIN quizzes q ON q.id = qa.quiz_id
    JOIN courses c ON c.id = q.course_id
    ORDER BY qa.id DESC
  `).all();
  return {
    title: 'Quiz Results Report',
    summary: [
      { label: 'Attempts', value: rows.length },
      { label: 'Avg Score', value: rows.length ? pct(rows.reduce((s, r) => s + r.score, 0), rows.length) + '%' : '—' },
    ],
    columns: ['Student ID', 'Name', 'Course', 'Quiz', 'Score', 'Total', 'Percentage'],
    rows: rows.map(r => [r.username, r.name, r.course_code, r.quiz, r.score, r.total, pct(r.score, r.total) + '%']),
  };
}

function coursesReport() {
  const rows = db.prepare(`
    SELECT c.code, c.title, c.instructor, c.level,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS students,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignments,
      (SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id) AS quizzes,
      (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_id = c.id) AS submissions
    FROM courses c ORDER BY c.code
  `).all();
  return {
    title: 'Course Enrollment Report',
    summary: [
      { label: 'Courses', value: rows.length },
      { label: 'Total Enrollments', value: rows.reduce((s, r) => s + r.students, 0) },
    ],
    columns: ['Code', 'Title', 'Instructor', 'Level', 'Students', 'Assignments', 'Quizzes', 'Submissions'],
    rows: rows.map(r => [r.code, r.title, r.instructor || '—', r.level, r.students, r.assignments, r.quizzes, r.submissions]),
  };
}

function paymentsReport() {
  const rows = db.prepare(`
    SELECT p.receipt_no, u.username, u.name, p.amount, p.method, p.note, p.paid_at
    FROM payments p JOIN users u ON u.id = p.student_id
    ORDER BY p.paid_at DESC
  `).all();
  return {
    title: 'Payments Report',
    summary: [
      { label: 'Transactions', value: rows.length },
      { label: 'Total Collected', value: formatMoney(rows.reduce((s, r) => s + r.amount, 0)) },
    ],
    columns: ['Receipt No', 'Student ID', 'Name', 'Amount', 'Method', 'Note', 'Date'],
    rows: rows.map(r => [r.receipt_no, r.username, r.name, formatMoney(r.amount), r.method || '—', r.note || '—', r.paid_at || '—']),
  };
}

function examsReport() {
  const rows = db.prepare(`
    SELECT c.code AS course_code, x.title, x.exam_date, x.max_marks,
      (SELECT COUNT(*) FROM exam_results r WHERE r.exam_id = x.id) AS results,
      (SELECT AVG(r.marks) FROM exam_results r WHERE r.exam_id = x.id) AS avg_marks
    FROM exams x JOIN courses c ON c.id = x.course_id
    ORDER BY x.exam_date
  `).all();
  return {
    title: 'Exam Results Report',
    summary: [
      { label: 'Exams', value: rows.length },
      { label: 'Results Entered', value: rows.reduce((s, r) => s + r.results, 0) },
    ],
    columns: ['Course', 'Exam', 'Date', 'Max Marks', 'Results', 'Average'],
    rows: rows.map(r => [r.course_code, r.title, r.exam_date || '—', r.max_marks, r.results,
                         r.avg_marks != null ? Math.round(r.avg_marks) + '/' + r.max_marks : '—']),
  };
}

function formatMoney(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const builders = {
  students: studentsReport,
  fees: feesReport,
  attendance: attendanceReport,
  grades: gradesReport,
  quizzes: quizzesReport,
  courses: coursesReport,
  payments: paymentsReport,
  exams: examsReport,
};

module.exports = { builders, formatMoney };
