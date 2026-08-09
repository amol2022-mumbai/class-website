// Report builders. Each returns a tabular structure the frontend can render
// generically and export to CSV: { title, summary, columns, rows }.
const db = require('./db');

const pct = (num, den) => (den ? Math.round((num / den) * 100) : 0);

const bw = (alias, bid) => (bid ? `${alias}.branch_id = ?` : '1=1');
const args = (bid) => (bid ? [bid] : []);

function studentsReport(bid) {
  const rows = db.prepare(`
    SELECT u.username, u.name, u.email, u.mobile, u.fee_amount, u.fee_paid,
      (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id) AS course_count,
      (SELECT COUNT(*) FROM attendance a WHERE a.student_id = u.id AND a.status = 'present') AS present_days,
      (SELECT COUNT(*) FROM attendance a WHERE a.student_id = u.id) AS total_days
    FROM users u WHERE u.role = 'student' AND ${bw('u', bid)} ORDER BY u.name
  `).all(...args(bid));
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

function feesReport(bid) {
  const finance = require('./finance');
  const rows = db.prepare(`
    SELECT u.id, u.username, u.name, u.fee_amount, u.fee_paid, u.discount_type, u.discount_value
    FROM users u WHERE u.role = 'student' AND ${bw('u', bid)} ORDER BY u.name
  `).all(...args(bid));
  const rowsWith = rows.map(r => ({
    ...r,
    effective: finance.effectiveFee(r),
    discount: finance.discountAmount(r),
    pending: finance.pendingAmount(r.id),
  }));
  const collected = rowsWith.reduce((s, r) => s + (r.effective - r.pending), 0);
  const pending = rowsWith.reduce((s, r) => s + r.pending, 0);
  const discountTotal = rowsWith.reduce((s, r) => s + r.discount, 0);
  return {
    title: 'Fee Collection Report',
    summary: [
      { label: 'Total Fee', value: formatMoney(rowsWith.reduce((s, r) => s + r.fee_amount, 0)) },
      { label: 'Concessions', value: formatMoney(discountTotal) },
      { label: 'Collected', value: formatMoney(collected) },
      { label: 'Pending', value: formatMoney(pending) },
      { label: 'Paid Students', value: rowsWith.filter(r => r.pending <= 0).length },
      { label: 'Pending Students', value: rowsWith.filter(r => r.pending > 0).length },
    ],
    columns: ['Student ID', 'Name', 'Fee Amount', 'Concession', 'Net Fee', 'Status', 'Pending Amount'],
    rows: rowsWith.map(r => [
      r.username, r.name, formatMoney(r.fee_amount),
      r.discount ? formatMoney(r.discount) : '—',
      formatMoney(r.effective),
      r.pending <= 0 ? 'PAID' : 'PENDING',
      formatMoney(r.pending),
    ]),
  };
}

function payrollReport(bid) {
  const rows = db.prepare(`
    SELECT ps.month, ps.salary_type, s.name, s.role, ps.working_days, ps.present_days, ps.absences,
           ps.monthly_salary, ps.gross_pay
    FROM payslips ps JOIN staff s ON s.id = ps.staff_id
    WHERE ${bw('s', bid)}
    ORDER BY ps.month DESC, s.name
  `).all(...args(bid));
  const totalGross = rows.reduce((s, r) => s + r.gross_pay, 0);
  return {
    title: 'Payroll Report',
    summary: [
      { label: 'Payslips', value: rows.length },
      { label: 'Gross Payroll', value: formatMoney(totalGross) },
      { label: 'Months', value: [...new Set(rows.map(r => r.month))].length },
    ],
    columns: ['Month', 'Staff', 'Role', 'Type', 'Working Days', 'Present', 'Absences', 'Monthly Salary', 'Gross Pay'],
    rows: rows.map(r => [
      r.month, r.name, r.role, r.salary_type, r.working_days, r.present_days, r.absences,
      formatMoney(r.monthly_salary), formatMoney(r.gross_pay),
    ]),
  };
}

function enquiriesReport(bid) {
  const rows = db.prepare(`
    SELECT e.name, e.phone, e.email, e.source, e.status, e.followup_date, e.created_at, c.title AS course
    FROM enquiries e LEFT JOIN courses c ON c.id = e.course_id
    WHERE ${bw('e', bid)} ORDER BY e.created_at DESC
  `).all(...args(bid));
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  return {
    title: 'Enquiry / Lead Report',
    summary: [
      { label: 'Total Leads', value: rows.length },
      { label: 'New', value: byStatus['new'] || 0 },
      { label: 'Follow-up', value: byStatus['follow-up'] || 0 },
      { label: 'Enrolled', value: byStatus['enrolled'] || 0 },
      { label: 'Lost', value: byStatus['lost'] || 0 },
    ],
    columns: ['Name', 'Phone', 'Email', 'Course', 'Source', 'Status', 'Follow-up', 'Created'],
    rows: rows.map(r => [
      r.name, r.phone || '—', r.email || '—', r.course || '—', r.source || '—',
      r.status, r.followup_date || '—', (r.created_at || '—').slice(0, 10),
    ]),
  };
}

function attendanceReport(bid) {
  const rows = db.prepare(`
    SELECT u.username, u.name,
      SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late,
      SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
      COUNT(a.id) AS total
    FROM users u
    LEFT JOIN enrollments e ON e.student_id = u.id
    LEFT JOIN courses c ON c.id = e.course_id AND ${bw('c', bid)}
    LEFT JOIN attendance a ON a.student_id = u.id AND a.course_id = c.id
    WHERE u.role = 'student' AND ${bw('u', bid)}
    GROUP BY u.id ORDER BY u.name
  `).all(...args(bid));
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

function gradesReport(bid) {
  const rows = db.prepare(`
    SELECT u.username, u.name, c.code AS course_code, a.title AS assignment,
           s.score, a.max_score
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.score IS NOT NULL AND ${bw('c', bid)}
    ORDER BY u.name, a.due_date
  `).all(...args(bid));
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

function quizzesReport(bid) {
  const rows = db.prepare(`
    SELECT u.username, u.name, c.code AS course_code, q.title AS quiz, qa.score, qa.total
    FROM quiz_attempts qa
    JOIN users u ON u.id = qa.student_id
    JOIN quizzes q ON q.id = qa.quiz_id
    JOIN courses c ON c.id = q.course_id
    WHERE ${bw('c', bid)}
    ORDER BY qa.id DESC
  `).all(...args(bid));
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

function coursesReport(bid) {
  const rows = db.prepare(`
    SELECT c.code, c.title, c.instructor, c.level,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS students,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignments,
      (SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id) AS quizzes,
      (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_id = c.id) AS submissions
    FROM courses c WHERE ${bw('c', bid)} ORDER BY c.code
  `).all(...args(bid));
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

function paymentsReport(bid) {
  const rows = db.prepare(`
    SELECT p.receipt_no, u.username, u.name, p.amount, p.method, p.note, p.paid_at
    FROM payments p JOIN users u ON u.id = p.student_id
    WHERE ${bw('p', bid)}
    ORDER BY p.paid_at DESC
  `).all(...args(bid));
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

function examsReport(bid) {
  const rows = db.prepare(`
    SELECT c.code AS course_code, x.title, x.exam_date, x.max_marks,
      (SELECT COUNT(*) FROM exam_results r WHERE r.exam_id = x.id) AS results,
      (SELECT AVG(r.marks) FROM exam_results r WHERE r.exam_id = x.id) AS avg_marks
    FROM exams x JOIN courses c ON c.id = x.course_id
    WHERE ${bw('c', bid)}
    ORDER BY x.exam_date
  `).all(...args(bid));
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

function incomeReport(bid) {
  const incomeRows = db.prepare(`
    SELECT substr(p.paid_at, 1, 7) AS month, COUNT(*) AS txns, COALESCE(SUM(p.amount), 0) AS amount
    FROM payments p JOIN users u ON u.id = p.student_id
    WHERE ${bw('p', bid)}
    GROUP BY month ORDER BY month
  `).all(...args(bid));
  const expenseRows = db.prepare(`
    SELECT substr(e.expense_date, 1, 7) AS month, COUNT(*) AS txns, COALESCE(SUM(e.amount), 0) AS amount
    FROM expenses e
    WHERE ${bw('e', bid)}
    GROUP BY month ORDER BY month
  `).all(...args(bid));

  const months = [...new Set([...incomeRows.map(r => r.month), ...expenseRows.map(r => r.month)])].filter(Boolean).sort();
  const byMonth = months.map(m => {
    const inc = incomeRows.find(r => r.month === m);
    const exp = expenseRows.find(r => r.month === m);
    return {
      month: m,
      income: inc ? inc.amount : 0,
      incomeTxns: inc ? inc.txns : 0,
      expense: exp ? exp.amount : 0,
      expenseTxns: exp ? exp.txns : 0,
    };
  });
  const totalIncome = byMonth.reduce((s, r) => s + r.income, 0);
  const totalExpense = byMonth.reduce((s, r) => s + r.expense, 0);
  return {
    title: 'Income & Expense Report',
    summary: [
      { label: 'Income (Fees)', value: formatMoney(totalIncome) },
      { label: 'Expenses', value: formatMoney(totalExpense) },
      { label: 'Net Income', value: formatMoney(totalIncome - totalExpense) },
      { label: 'Months', value: byMonth.length },
    ],
    columns: ['Month', 'Income', 'Income Txns', 'Expenses', 'Expense Txns', 'Net'],
    rows: byMonth.map(r => [
      r.month, formatMoney(r.income), r.incomeTxns, formatMoney(r.expense), r.expenseTxns,
      formatMoney(r.income - r.expense),
    ]),
  };
}

function staffReport(bid) {
  const rows = db.prepare(`
    SELECT s.name, s.role, s.phone, s.email, s.salary, s.salary_type, s.join_date, s.status
    FROM staff s WHERE ${bw('s', bid)} ORDER BY s.name
  `).all(...args(bid));
  const monthly = rows.filter(r => r.salary_type === 'monthly').reduce((s, r) => s + (r.salary || 0), 0);
  return {
    title: 'Staff Report',
    summary: [
      { label: 'Staff Members', value: rows.length },
      { label: 'Active', value: rows.filter(r => r.status === 'active').length },
      { label: 'Monthly Payroll', value: formatMoney(monthly) },
    ],
    columns: ['Name', 'Role', 'Phone', 'Email', 'Salary', 'Type', 'Join Date', 'Status'],
    rows: rows.map(r => [r.name, r.role, r.phone || '—', r.email || '—', formatMoney(r.salary),
                         r.salary_type, r.join_date || '—', r.status]),
  };
}

function expensesReport(bid) {
  const rows = db.prepare(`
    SELECT e.category, e.amount, e.note, e.expense_date, e.created_at
    FROM expenses e WHERE ${bw('e', bid)} ORDER BY e.expense_date DESC
  `).all(...args(bid));
  const byCat = {};
  for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + (r.amount || 0);
  return {
    title: 'Expense Report',
    summary: [
      { label: 'Transactions', value: rows.length },
      { label: 'Total Expenses', value: formatMoney(rows.reduce((s, r) => s + (r.amount || 0), 0)) },
      { label: 'Top Category', value: Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] || '—' },
    ],
    columns: ['Category', 'Amount', 'Note', 'Date'],
    rows: rows.map(r => [r.category, formatMoney(r.amount), r.note || '—', r.expense_date || '—']),
  };
}

function gradeFor(pct) {
  if (pct == null) return '—';
  if (pct >= 90) return 'A+';
  if (pct >= 75) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 45) return 'C';
  if (pct >= 35) return 'D';
  return 'F';
}

// Per-student report card: exam average, attendance % and grade per course.
function reportcardReport(bid) {
  const students = db.prepare(`
    SELECT u.id, u.username, u.name FROM users u
    WHERE u.role = 'student' AND ${bw('u', bid)} ORDER BY u.name
  `).all(...args(bid));
  const rows = [];
  for (const s of students) {
    const courses = db.prepare(`
      SELECT c.id, c.code, c.title FROM enrollments e JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = ? ORDER BY c.code
    `).all(s.id);
    for (const c of courses) {
      const exams = db.prepare(`
        SELECT x.max_marks, r.marks FROM exams x
        LEFT JOIN exam_results r ON r.exam_id = x.id AND r.student_id = ?
        WHERE x.course_id = ?
      `).all(s.id, c.id);
      const graded = exams.filter(e => e.marks != null);
      const examAvg = graded.length
        ? Math.round(graded.reduce((t, e) => t + (e.max_marks ? (e.marks / e.max_marks) * 100 : 0), 0) / graded.length)
        : null;
      const att = db.prepare(`
        SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present
        FROM attendance WHERE student_id = ? AND course_id = ?
      `).get(s.id, c.id);
      const attPct = att.total ? Math.round((att.present / att.total) * 100) : null;
      const metric = examAvg != null ? examAvg : attPct;
      rows.push([s.username, s.name, c.code, c.title,
                 graded.length || '—', examAvg != null ? examAvg + '%' : '—',
                 attPct != null ? attPct + '%' : '—', gradeFor(metric)]);
    }
  }
  return {
    title: 'Report Cards (All Students)',
    summary: [
      { label: 'Students', value: students.length },
      { label: 'Course Enrollments', value: rows.length },
      { label: 'Grade A or Above', value: rows.filter(r => ['A', 'A+'].includes(r[7])).length },
    ],
    columns: ['Student ID', 'Name', 'Course', 'Course Title', 'Exams', 'Exam Avg', 'Attendance', 'Grade'],
    rows,
  };
}

function gstReport(bid) {
  const finance = require('./finance');
  const periods = db.prepare(`
    SELECT DISTINCT substr(paid_at, 1, 7) AS month FROM payments
    WHERE ${bw('payments', bid)} AND paid_at IS NOT NULL ORDER BY month
  `).all(...args(bid));
  const rows = [];
  let totalOut = 0, totalInput = 0;
  for (const p of periods) {
    const payments = db.prepare(`
      SELECT p.amount, b.gst_rate AS rate FROM payments p
      LEFT JOIN branches b ON b.id = p.branch_id
      WHERE ${bw('p', bid)} AND substr(p.paid_at, 1, 7) = ?
    `).all(...args(bid), p.month);
    let out = 0;
    for (const pm of payments) {
      const rate = Number(pm.rate) || 18;
      out += Math.round((Number(pm.amount) - Number(pm.amount) / (1 + rate / 100)) * 100) / 100;
    }
    const input = db.prepare(`
      SELECT COALESCE(SUM(input_credit), 0) AS c FROM vendor_purchases
      WHERE ${bw('vendor_purchases', bid)} AND substr(bill_date, 1, 7) = ?
    `).get(...args(bid), p.month).c;
    totalOut += out; totalInput += input;
    rows.push([p.month, payments.length, formatMoney(out), formatMoney(input), formatMoney(out - input)]);
  }
  return {
    title: 'GST Summary (Output vs Input Credit)',
    summary: [
      { label: 'Output GST', value: formatMoney(totalOut) },
      { label: 'Input Credit', value: formatMoney(totalInput) },
      { label: 'Net Payable', value: formatMoney(totalOut - totalInput) },
    ],
    columns: ['Month', 'Invoices', 'Output GST', 'Input Credit', 'Net Payable'],
    rows,
  };
}

function assetsReport(bid) {
  const rows = db.prepare(`
    SELECT a.name, a.category, a.tag_no, a.cost, a.purchase_date, a.status
    FROM assets a WHERE ${bw('a', bid)} ORDER BY a.category, a.name
  `).all(...args(bid));
  const totalValue = rows.reduce((s, r) => s + (r.cost || 0), 0);
  return {
    title: 'Asset / Inventory Report',
    summary: [
      { label: 'Assets', value: rows.length },
      { label: 'Total Value', value: formatMoney(totalValue) },
      { label: 'In Use', value: rows.filter(r => r.status === 'in-use').length },
    ],
    columns: ['Asset', 'Category', 'Tag No', 'Cost', 'Purchase Date', 'Status'],
    rows: rows.map(r => [r.name, r.category || '—', r.tag_no || '—', formatMoney(r.cost), r.purchase_date || '—', r.status]),
  };
}

function libraryReport(bid) {
  const books = db.prepare(`
    SELECT b.title, b.author, b.isbn, b.category, b.quantity, b.available,
      (SELECT COUNT(*) FROM library_loans l WHERE l.book_id = b.id AND l.status = 'issued') AS issued
    FROM books b WHERE ${bw('b', bid)} ORDER BY b.title
  `).all(...args(bid));
  const loans = db.prepare(`
    SELECT l.issue_date, l.due_date, l.return_date, l.fine, l.status,
           b.title AS book_title, u.name AS student_name
    FROM library_loans l JOIN books b ON b.id = l.book_id JOIN users u ON u.id = l.student_id
    WHERE ${bw('b', bid)} ORDER BY l.issue_date DESC
  `).all(...args(bid));
  return {
    title: 'Library Report',
    summary: [
      { label: 'Titles', value: books.length },
      { label: 'Copies', value: books.reduce((s, r) => s + (r.quantity || 0), 0) },
      { label: 'Issued Now', value: loans.filter(r => r.status === 'issued').length },
      { label: 'Fines Collected', value: formatMoney(loans.reduce((s, r) => s + (r.fine || 0), 0)) },
    ],
    columns: ['Book', 'Author', 'ISBN', 'Category', 'Total', 'Available', 'Issued'],
    rows: books.map(r => [r.title, r.author || '—', r.isbn || '—', r.category || '—', r.quantity, r.available, r.issued]),
  };
}

// Detailed loan ledger - every issue and return transaction.
function bookIssuesReport(bid) {
  const rows = db.prepare(`
    SELECT l.id, b.title AS book_title, u.username, u.name AS student_name,
           l.issue_date, l.due_date, l.return_date, l.status, l.fine
    FROM library_loans l JOIN books b ON b.id = l.book_id JOIN users u ON u.id = l.student_id
    WHERE ${bw('b', bid)}
    ORDER BY l.issue_date DESC, l.id DESC
  `).all(...args(bid));
  const today = new Date().toISOString().slice(0, 10);
  const overdueNow = rows.filter(r => r.status === 'issued' && r.due_date < today);
  return {
    title: 'Book Issue Register',
    summary: [
      { label: 'Total Issues', value: rows.length },
      { label: 'Currently Issued', value: rows.filter(r => r.status === 'issued').length },
      { label: 'Returned', value: rows.filter(r => r.status === 'returned').length },
      { label: 'Overdue Right Now', value: overdueNow.length },
      { label: 'Fines Levied', value: formatMoney(rows.reduce((s, r) => s + (r.fine || 0), 0)) },
    ],
    columns: ['Issue ID', 'Book', 'Student ID', 'Student', 'Issue Date', 'Due Date', 'Return Date', 'Status', 'Overdue (Days)', 'Fine'],
    rows: rows.map(r => {
      const overdueDays = r.status === 'issued' && r.due_date < today
        ? Math.round((new Date(today) - new Date(r.due_date + 'T00:00:00')) / 86400000) : 0;
      return [
        r.id, r.book_title, r.username, r.student_name, r.issue_date || '—', r.due_date,
        r.return_date || '—', r.status, overdueDays ? overdueDays : '—', formatMoney(r.fine),
      ];
    }),
  };
}

// Books currently on loan that are past their due date.
function overdueReport(bid) {
  const rows = db.prepare(`
    SELECT b.title AS book_title, u.username, u.name AS student_name, u.mobile,
           l.issue_date, l.due_date, l.fine
    FROM library_loans l JOIN books b ON b.id = l.book_id JOIN users u ON u.id = l.student_id
    WHERE ${bw('b', bid)} AND l.status = 'issued'
    ORDER BY l.due_date
  `).all(...args(bid));
  const today = new Date().toISOString().slice(0, 10);
  const overdue = rows.filter(r => r.due_date < today).map(r => ({
    ...r,
    days: Math.round((new Date(today) - new Date(r.due_date + 'T00:00:00')) / 86400000),
  }));
  return {
    title: 'Overdue Books Report',
    summary: [
      { label: 'Overdue Books', value: overdue.length },
      { label: 'Affected Students', value: [...new Set(overdue.map(r => r.username))].length },
      { label: 'Total Fines Due', value: formatMoney(overdue.reduce((s, r) => s + r.days * 5, 0)) },
    ],
    columns: ['Book', 'Student ID', 'Student', 'Mobile', 'Issue Date', 'Due Date', 'Days Overdue', 'Fine @ Rs.5/day'],
    rows: overdue.map(r => [
      r.book_title, r.username, r.student_name, r.mobile || '—', r.issue_date, r.due_date,
      r.days, formatMoney(r.days * 5),
    ]),
  };
}

function transportReport(bid) {
  const routes = db.prepare(`
    SELECT r.name, r.vehicle_no, r.driver_name, r.driver_phone, r.fee_monthly, r.status,
      (SELECT COUNT(*) FROM route_students rs WHERE rs.route_id = r.id) AS students
    FROM routes r WHERE ${bw('r', bid)} ORDER BY r.name
  `).all(...args(bid));
  const assignments = db.prepare(`
    SELECT r.name AS route_name, rs.stop_name, rs.boarding_time, u.name AS student_name, u.username
    FROM route_students rs JOIN routes r ON r.id = rs.route_id JOIN users u ON u.id = rs.student_id
    WHERE ${bw('r', bid)} ORDER BY r.name, rs.boarding_time
  `).all(...args(bid));
  return {
    title: 'Transport Report',
    summary: [
      { label: 'Active Routes', value: routes.filter(r => r.status === 'active').length },
      { label: 'Students Assigned', value: assignments.length },
      { label: 'Monthly Transport Revenue', value: formatMoney(routes.reduce((s, r) => s + (r.fee_monthly || 0) * r.students, 0)) },
    ],
    columns: ['Route', 'Vehicle', 'Driver', 'Monthly Fee', 'Students', 'Status'],
    rows: routes.map(r => [r.name, r.vehicle_no || '—', (r.driver_name || '') + ' ' + (r.driver_phone || ''), formatMoney(r.fee_monthly), r.students, r.status]),
  };
}

function leavesReport() {
  const rows = db.prepare(`
    SELECT l.employee_name, l.employee_type, l.leave_type, l.start_date, l.end_date, l.days, l.status, l.applied_on
    FROM leaves l ORDER BY l.applied_on DESC
  `).all();
  return {
    title: 'Leave Register',
    summary: [
      { label: 'Total Requests', value: rows.length },
      { label: 'Pending', value: rows.filter(r => r.status === 'pending').length },
      { label: 'Approved', value: rows.filter(r => r.status === 'approved').length },
      { label: 'Rejected', value: rows.filter(r => r.status === 'rejected').length },
    ],
    columns: ['Employee', 'Type', 'Leave Type', 'Start', 'End', 'Days', 'Status', 'Applied'],
    rows: rows.map(r => [r.employee_name, r.employee_type, r.leave_type, r.start_date, r.end_date, r.days, r.status, (r.applied_on || '').slice(0, 16)]),
  };
}

function formatMoney(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
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
  income: incomeReport,
  staff: staffReport,
  expenses: expensesReport,
  payroll: payrollReport,
  enquiries: enquiriesReport,
  reportcard: reportcardReport,
  gst: gstReport,
  assets: assetsReport,
  library: libraryReport,
  bookissues: bookIssuesReport,
  overdue: overdueReport,
  transport: transportReport,
  leaves: leavesReport,
};

module.exports = { builders, formatMoney };
