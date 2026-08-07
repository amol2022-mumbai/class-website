const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Uses node:sqlite (DatabaseSync) - built into Node.js 22.13+, zero native
// dependencies, so no compilation is required on standard hosting (Hostinger etc).
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error(
    '\n[node:sqlite] The built-in SQLite module was not found.\n' +
    '  This app requires Node.js 22.13 or newer (Node 22.13+, 23.4+, 24+).\n' +
    '  Pick a Node.js LTS version >= 22.13 in your hosting control panel.\n' +
    '  No extra packages are needed - SQLite ships inside Node.js.\n'
  );
  process.exit(1);
}

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'lms.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    address TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    gst_rate REAL DEFAULT 18
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'student', 'faculty', 'parent')),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    mobile TEXT,
    fee_amount REAL DEFAULT 0,
    fee_paid INTEGER DEFAULT 0,
    branch_id INTEGER REFERENCES branches(id)
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    instructor TEXT,
    weeks INTEGER DEFAULT 12,
    level TEXT DEFAULT 'Beginner',
    branch_id INTEGER REFERENCES branches(id)
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'Staff',
    phone TEXT,
    email TEXT,
    salary REAL DEFAULT 0,
    salary_type TEXT DEFAULT 'monthly',
    join_date TEXT,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT,
    expense_date TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    batch_id INTEGER,
    enrolled_at TEXT DEFAULT (datetime('now')),
    UNIQUE(student_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    capacity INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS timetable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    subject TEXT NOT NULL,
    instructor TEXT
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    method TEXT DEFAULT 'cash',
    receipt_no TEXT,
    note TEXT,
    branch_id INTEGER REFERENCES branches(id),
    paid_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    exam_date TEXT,
    max_marks INTEGER DEFAULT 100,
    duration_minutes INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS exam_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    marks REAL NOT NULL DEFAULT 0,
    UNIQUE(exam_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS exam_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_index INTEGER NOT NULL,
    marks REAL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    cert_no TEXT NOT NULL UNIQUE,
    type TEXT DEFAULT 'completion',
    issued_date TEXT DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS faculty_courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE(faculty_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS parent_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(parent_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    purpose TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    sent_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    max_score INTEGER DEFAULT 100,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    score INTEGER,
    submitted_at TEXT DEFAULT (datetime('now')),
    UNIQUE(assignment_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    time_limit INTEGER DEFAULT 15,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_index INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    submitted_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late')),
    UNIQUE(student_id, course_id, date)
  );
`);

// Migrations for databases created by earlier versions of the app.
function migrate() {
  const usersCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!usersCols.includes('mobile')) db.exec('ALTER TABLE users ADD COLUMN mobile TEXT');
  if (!usersCols.includes('fee_amount')) db.exec('ALTER TABLE users ADD COLUMN fee_amount REAL DEFAULT 0');
  if (!usersCols.includes('fee_paid')) db.exec('ALTER TABLE users ADD COLUMN fee_paid INTEGER DEFAULT 0');

  // Older DBs restricted role to (admin, student) with a CHECK constraint that
  // cannot be altered, so rebuild the users table to allow faculty/parent roles.
  const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (usersSql && !String(usersSql.sql).includes('faculty')) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('PRAGMA legacy_alter_table = ON');
    db.exec('ALTER TABLE users RENAME TO users_old');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL CHECK (role IN ('admin', 'student', 'faculty', 'parent')),
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        mobile TEXT,
        fee_amount REAL DEFAULT 0,
        fee_paid INTEGER DEFAULT 0,
        branch_id INTEGER
      )
    `);
    db.exec(`
      INSERT INTO users (id, role, username, password_hash, name, email, mobile, fee_amount, fee_paid, branch_id)
      SELECT id, role, username, password_hash, name, email, mobile, fee_amount, fee_paid, branch_id FROM users_old
    `);
    db.exec('DROP TABLE users_old');
    db.exec('PRAGMA legacy_alter_table = OFF');
    db.exec('PRAGMA foreign_keys = ON');
  }

  const enrollCols = db.prepare('PRAGMA table_info(enrollments)').all().map((c) => c.name);
  if (!enrollCols.includes('batch_id')) {
    db.exec('ALTER TABLE enrollments ADD COLUMN batch_id INTEGER');
  }

  const examCols = db.prepare('PRAGMA table_info(exams)').all().map((c) => c.name);
  if (!examCols.includes('duration_minutes')) {
    db.exec('ALTER TABLE exams ADD COLUMN duration_minutes INTEGER DEFAULT 0');
  }

  const addCol = (table, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(def.split(' ')[0])) db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
  };
  addCol('users', 'branch_id INTEGER');
  addCol('courses', 'branch_id INTEGER');
  addCol('payments', 'branch_id INTEGER');
}

// Backfills branch_id on rows created before branches existed, and guarantees a
// default branch exists so every record belongs to a branch.
function ensureBranch() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM branches').get().c;
  if (count === 0) {
    db.prepare(
      'INSERT INTO branches (name, code, address, phone, email, gstin, gst_rate) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('Main Campus', 'MAIN', 'Plot 14, Sector 7, New Mumbai - 400 710', '+91 98765 43210',
          'accounts@vumcahitech.io', '27ABCDE1234F1Z5', 18);
  }
  const def = db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
  db.prepare('UPDATE users SET branch_id = ? WHERE branch_id IS NULL').run(def.id);
  db.prepare('UPDATE courses SET branch_id = ? WHERE branch_id IS NULL').run(def.id);
  db.prepare('UPDATE payments SET branch_id = ? WHERE branch_id IS NULL').run(def.id);
}

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return;

  const defBranch = db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
  const bid = defBranch ? defBranch.id : 1;

  const insertUser = db.prepare(
    'INSERT INTO users (role, username, password_hash, name, email, mobile, fee_amount, fee_paid, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const adminHash = bcrypt.hashSync('admin123', 10);
  insertUser.run('admin', 'admin', adminHash, 'System Administrator', 'admin@vumcahitech.io', '+1 555 010 0000', 0, 1, bid);

  const studentData = [
    ['STU001', 'Aarav Sharma', 'aarav@example.com', 'student123', '+91 98765 43210', 1200, 1],
    ['STU002', 'Meera Patel', 'meera@example.com', 'student123', '+91 91234 56789', 1200, 1],
    ['STU003', 'John Carter', 'john@example.com', 'student123', '+1 555 014 2001', 1500, 0],
    ['STU004', 'Lina Chen', 'lina@example.com', 'student123', '+86 138 0013 8000', 1300, 0],
    ['STU005', 'Diego Morales', 'diego@example.com', 'student123', '+52 55 1234 5678', 1100, 1],
    ['STU006', 'Fatima Noor', 'fatima@example.com', 'student123', '+92 300 1234567', 1000, 0],
  ];

  const studentIds = [];
  for (const [username, name, email, pass, mobile, feeAmount, feePaid] of studentData) {
    const hash = bcrypt.hashSync(pass, 10);
    const res = insertUser.run('student', username, hash, name, email, mobile, feeAmount, feePaid, bid);
    studentIds.push(res.lastInsertRowid);
  }

  const insertCourse = db.prepare(
    'INSERT INTO courses (code, title, description, instructor, weeks, level, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const courses = [
    ['CS101', 'Intro to Programming', 'Python fundamentals, algorithms and problem-solving techniques.', 'Dr. Alan Vega', 12, 'Beginner'],
    ['CS201', 'Full-Stack Web Dev', 'HTML, CSS, JavaScript, Node.js and database design.', 'Prof. R. Iyer', 16, 'Intermediate'],
    ['CS301', 'AI & Machine Learning', 'Neural networks, data science and model deployment.', 'Dr. S. Kim', 14, 'Advanced'],
    ['CS204', 'Database Systems', 'SQL, relational design, indexing and data modeling.', 'Dr. Alan Vega', 12, 'Intermediate'],
    ['CS105', 'Computer Networks', 'TCP/IP, routing, HTTP and network security basics.', 'Prof. R. Iyer', 10, 'Beginner'],
  ];
  const courseIds = [];
  for (const c of courses) {
    const res = insertCourse.run(...c, bid);
    courseIds.push(res.lastInsertRowid);
  }

  const insertEnrollment = db.prepare(
    'INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)'
  );
  const enrollmentMap = [
    [0, 0], [0, 1], [0, 3],
    [1, 0], [1, 2],
    [2, 1], [2, 3],
    [3, 2], [3, 4],
    [4, 0], [4, 4],
    [5, 1], [5, 2], [5, 3],
  ];
  for (const [s, c] of enrollmentMap) {
    insertEnrollment.run(studentIds[s], courseIds[c]);
  }

  const insertAssignment = db.prepare(
    'INSERT INTO assignments (course_id, title, description, due_date, max_score) VALUES (?, ?, ?, ?, ?)'
  );
  insertAssignment.run(courseIds[0], 'Python Basics Lab', 'Write a program that computes the Fibonacci sequence up to N terms.', '2026-08-20', 100);
  insertAssignment.run(courseIds[0], 'Algorithm Worksheet', 'Implement binary search and analyze its time complexity.', '2026-08-28', 50);
  insertAssignment.run(courseIds[1], 'Portfolio Page', 'Build a responsive personal portfolio using HTML and CSS.', '2026-09-05', 100);
  insertAssignment.run(courseIds[2], 'Linear Regression Model', 'Train a linear regression model on the provided dataset.', '2026-09-12', 100);
  insertAssignment.run(courseIds[4], 'Subnetting Exercise', 'Compute subnet masks for the given network scenarios.', '2026-08-25', 50);

  const insertQuiz = db.prepare(
    'INSERT INTO quizzes (course_id, title, description, time_limit) VALUES (?, ?, ?, ?)'
  );
  const quiz1 = insertQuiz.run(courseIds[0], 'Python Fundamentals Quiz', 'Variables, loops and functions.', 10).lastInsertRowid;
  const quiz2 = insertQuiz.run(courseIds[1], 'HTML & CSS Basics', 'Tags, selectors and layout.', 10).lastInsertRowid;
  const quiz3 = insertQuiz.run(courseIds[2], 'ML Core Concepts', 'Supervised learning and model evaluation.', 12).lastInsertRowid;

  const insertQuestion = db.prepare(
    'INSERT INTO questions (quiz_id, text, options, correct_index) VALUES (?, ?, ?, ?)'
  );
  const q1 = [
    ['Which keyword defines a function in Python?', JSON.stringify(['func', 'def', 'function', 'lambda']), 1],
    ['What is the output of type([])?', JSON.stringify(["'list'", "'dict'", "'tuple'", "'array'"]), 0],
    ['Which of these is an immutable data type?', JSON.stringify(['list', 'set', 'tuple', 'dict']), 2],
    ['What does the range(3) produce?', JSON.stringify(['[1,2,3]', '[0,1,2]', '[1,2]', '[3]']), 1],
    ['Which loop is used to iterate over a sequence?', JSON.stringify(['while', 'for', 'switch', 'repeat']), 1],
  ];
  for (const [text, options, idx] of q1) insertQuestion.run(quiz1, text, options, idx);

  const q2 = [
    ['Which HTML tag creates the largest heading?', JSON.stringify(['<heading>', '<h1>', '<h6>', '<head>']), 1],
    ['Which CSS property changes text color?', JSON.stringify(['font-color', 'text-color', 'color', 'text-style']), 2],
    ['Which CSS selector targets an element by its id?', JSON.stringify(['.id', '#id', '*id', 'id']), 1],
    ['Which HTML element is used for an unordered list?', JSON.stringify(['<ol>', '<li>', '<ul>', '<list>']), 2],
    ['Which attribute specifies an image path?', JSON.stringify(['href', 'src', 'alt', 'link']), 1],
  ];
  for (const [text, options, idx] of q2) insertQuestion.run(quiz2, text, options, idx);

  const q3 = [
    ['Which algorithm is used for classification?', JSON.stringify(['Linear Regression', 'Logistic Regression', 'K-Means', 'DBSCAN']), 1],
    ['Overfitting means:', JSON.stringify(['Model is too simple', 'Model learns training noise too well', 'Model underperforms on both sets', 'Data is imbalanced']), 1],
    ['What is accuracy?', JSON.stringify(['Correct predictions / total predictions', 'Total predictions / correct', 'Loss value', 'Learning rate']), 0],
    ['Which metric is for regression?', JSON.stringify(['F1-score', 'Accuracy', 'MSE', 'Precision']), 2],
    ['What does a learning rate control?', JSON.stringify(['Batch size', 'Step size during gradient descent', 'Number of layers', 'Feature count']), 1],
  ];
  for (const [text, options, idx] of q3) insertQuestion.run(quiz3, text, options, idx);

  const today = new Date();
  const formatDate = (d) => d.toISOString().slice(0, 10);
  const dayOffset = (n) => formatDate(new Date(today.getTime() - n * 86400000));

  const insertAttendance = db.prepare(
    'INSERT INTO attendance (student_id, course_id, date, status) VALUES (?, ?, ?, ?)'
  );
  const statusPool = ['present', 'present', 'present', 'late', 'absent'];
  for (let s = 0; s < studentIds.length; s++) {
    for (const c of enrollmentMap.filter(([si]) => si === s).map(([, ci]) => ci)) {
      for (let d = 1; d <= 5; d++) {
        insertAttendance.run(
          studentIds[s],
          courseIds[c],
          dayOffset(d),
          statusPool[Math.floor(Math.random() * statusPool.length)]
        );
      }
    }
  }
}

// Seeds the extended modules (faculty, parents, batches, timetable, payments,
// exams, certificates, notifications). Runs independently of the main seed so
// existing databases also get demo data for the new features.
function seedModules() {
  const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  const studentIds = db.prepare("SELECT id FROM users WHERE role = 'student' ORDER BY id").all().map(r => r.id);
  const courseIds = db.prepare('SELECT id FROM courses ORDER BY id').all().map(r => r.id);

  // Backfill fee amounts and mobile numbers for students created before those
  // columns existed (migrated databases). Only touches records still empty.
  const feeDefaults = [
    ['STU001', 1200, '+91 98765 43210'], ['STU002', 1200, '+91 91234 56789'],
    ['STU003', 1500, '+1 555 014 2001'], ['STU004', 1300, '+86 138 0013 8000'],
    ['STU005', 1100, '+52 55 1234 5678'], ['STU006', 1000, '+92 300 1234567'],
  ];
  const setFee = db.prepare('UPDATE users SET fee_amount = ? WHERE username = ? AND fee_amount = 0');
  const setMobile = db.prepare('UPDATE users SET mobile = ? WHERE username = ? AND (mobile IS NULL OR mobile = \'\')');
  for (const [u, amt, mob] of feeDefaults) {
    setFee.run(amt, u);
    setMobile.run(mob, u);
  }
  const insertUser = db.prepare(
    'INSERT INTO users (role, username, password_hash, name, email, mobile, fee_amount, fee_paid, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const defBranchId = () => db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get().id;
  const today = new Date();
  const formatDate = (d) => d.toISOString().slice(0, 10);
  const formatFut = (n) => formatDate(new Date(today.getTime() + n * 86400000));

  // ---- Faculty ----
  if (count('faculty_courses') === 0) {
    const facultyData = [
      ['FAC001', 'Dr. Alan Vega', 'alan@example.com', 'faculty123', '+1 555 010 2001'],
      ['FAC002', 'Prof. R. Iyer', 'iyer@example.com', 'faculty123', '+91 90000 12345'],
      ['FAC003', 'Dr. S. Kim', 'kim@example.com', 'faculty123', '+82 10 1234 5678'],
    ];
    const facultyIds = [];
    for (const [username, name, email, pass, mobile] of facultyData) {
      const hash = bcrypt.hashSync(pass, 10);
      const res = insertUser.run('faculty', username, hash, name, email, mobile, 0, 1, defBranchId());
      facultyIds.push(res.lastInsertRowid);
    }
    const insertFacultyCourse = db.prepare(
      'INSERT INTO faculty_courses (faculty_id, course_id) VALUES (?, ?)'
    );
    // FAC001 -> CS101, CS204 ; FAC002 -> CS201, CS105 ; FAC003 -> CS301
    const facultyCourseMap = [[0, 0], [0, 3], [1, 1], [1, 4], [2, 2]];
    for (const [f, c] of facultyCourseMap) insertFacultyCourse.run(facultyIds[f], courseIds[c]);
  }

  // ---- Parents ----
  if (count('parent_students') === 0) {
    const parentData = [
      ['PAR001', 'Rajesh Sharma', 'STU001', 'parent123'],
      ['PAR002', 'Neha Patel', 'STU002', 'parent123'],
      ['PAR003', 'Michael Carter', 'STU003', 'parent123'],
      ['PAR004', 'Wei Chen', 'STU004', 'parent123'],
      ['PAR005', 'Sofia Morales', 'STU005', 'parent123'],
      ['PAR006', 'Omar Noor', 'STU006', 'parent123'],
    ];
    const insertParentLink = db.prepare(
      'INSERT INTO parent_students (parent_id, student_id) VALUES (?, ?)'
    );
    for (const [username, name, stuUser, pass] of parentData) {
      const hash = bcrypt.hashSync(pass, 10);
      const parentRes = insertUser.run('parent', username, hash, name, null, null, 0, 1, defBranchId());
      const stuRow = db.prepare('SELECT id FROM users WHERE username = ?').get(stuUser);
      insertParentLink.run(parentRes.lastInsertRowid, stuRow.id);
    }
  }

  // ---- Batches + timetable ----
  const batchIds = db.prepare('SELECT id FROM batches ORDER BY id').all().map(r => r.id);
  if (count('batches') === 0) {
    const insertBatch = db.prepare(
      'INSERT INTO batches (course_id, name, start_date, end_date, capacity) VALUES (?, ?, ?, ?, ?)'
    );
    const batchData = [
      [0, 'CS101 - Batch A', formatFut(0), formatFut(80), 30],
      [1, 'CS201 - Batch A', formatFut(0), formatFut(110), 25],
      [2, 'CS301 - Batch A', formatFut(0), formatFut(95), 20],
    ];
    for (const b of batchData) {
      const res = insertBatch.run(courseIds[b[0]], b[1], b[2], b[3], b[4]);
      batchIds.push(res.lastInsertRowid);
    }
  }
  if (count('timetable') === 0 && batchIds.length > 0) {
    const insertTimetable = db.prepare(
      'INSERT INTO timetable (batch_id, day, start_time, end_time, subject, instructor) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const timetableData = [
      [0, 'Monday', '09:00', '10:30', 'Programming', 'Dr. Alan Vega'],
      [0, 'Wednesday', '09:00', '10:30', 'Programming Lab', 'Dr. Alan Vega'],
      [0, 'Friday', '11:00', '12:30', 'Problem Solving', 'Dr. Alan Vega'],
      [1, 'Tuesday', '10:00', '12:00', 'Web Dev', 'Prof. R. Iyer'],
      [1, 'Thursday', '10:00', '12:00', 'Web Dev Lab', 'Prof. R. Iyer'],
      [2, 'Monday', '14:00', '16:00', 'AI/ML', 'Dr. S. Kim'],
      [2, 'Thursday', '14:00', '16:00', 'AI Lab', 'Dr. S. Kim'],
    ];
    for (const t of timetableData) insertTimetable.run(batchIds[t[0]], t[1], t[2], t[3], t[4], t[5]);
  }
  // Assign students to batches (if no enrollment has a batch yet)
  if (db.prepare('SELECT COUNT(*) AS c FROM enrollments WHERE batch_id IS NOT NULL').get().c === 0 && batchIds.length > 0) {
    const assignBatch = db.prepare(
      'UPDATE enrollments SET batch_id = ? WHERE student_id = ? AND course_id = ?'
    );
    const batchEnroll = [
      [0, 0, 0], [1, 0, 1], [0, 1, 0], [2, 1, 2],
      [1, 2, 1], [0, 2, 3], [2, 3, 2], [2, 4, 2],
      [0, 4, 0], [1, 5, 1], [2, 5, 2],
    ];
    for (const [b, s, c] of batchEnroll) assignBatch.run(batchIds[b], studentIds[s], courseIds[c]);
  }

  // ---- Payments / receipts ----
  if (count('payments') === 0) {
    const insertPayment = db.prepare(
      'INSERT INTO payments (student_id, amount, method, receipt_no, note, branch_id, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const pbid = defBranchId();
    insertPayment.run(studentIds[0], 600, 'cash', 'RCP-2026-0001', 'First installment', pbid, formatFut(-10) + ' 10:30:00');
    insertPayment.run(studentIds[0], 600, 'upi', 'RCP-2026-0002', 'Second installment', pbid, formatFut(-3) + ' 12:00:00');
    insertPayment.run(studentIds[1], 1200, 'card', 'RCP-2026-0003', 'Full payment', pbid, formatFut(-5) + ' 15:45:00');
  }

  // ---- Exams + results ----
  if (count('exams') === 0) {
    const insertExam = db.prepare(
      'INSERT INTO exams (course_id, title, exam_date, max_marks) VALUES (?, ?, ?, ?)'
    );
    const exam1 = insertExam.run(courseIds[0], 'CS101 Mid-Term', formatFut(20), 100).lastInsertRowid;
    const exam2 = insertExam.run(courseIds[1], 'CS201 Web Fundamentals Test', formatFut(25), 100).lastInsertRowid;
    const insertResult = db.prepare(
      'INSERT INTO exam_results (exam_id, student_id, marks) VALUES (?, ?, ?)'
    );
    const exam1Students = [0, 1, 4]; // enrolled in CS101
    for (const s of exam1Students) {
      insertResult.run(exam1, studentIds[s], 55 + Math.floor(Math.random() * 40));
    }
    const exam2Students = [0, 2, 5]; // enrolled in CS201
    for (const s of exam2Students) {
      insertResult.run(exam2, studentIds[s], 50 + Math.floor(Math.random() * 45));
    }
  }

  // ---- Certificates ----
  if (count('certificates') === 0) {
    const insertCertificate = db.prepare(
      'INSERT INTO certificates (student_id, course_id, cert_no, type, issued_date) VALUES (?, ?, ?, ?, ?)'
    );
    insertCertificate.run(studentIds[0], courseIds[1], 'CERT-2026-0001', 'completion', formatFut(-2));
    insertCertificate.run(studentIds[2], courseIds[0], 'CERT-2026-0002', 'completion', formatFut(-2));
  }

  // ---- Notifications log ----
  if (count('notifications') === 0) {
    const insertNotification = db.prepare(
      'INSERT INTO notifications (student_id, channel, purpose, message, status, sent_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertNotification.run(studentIds[3], 'whatsapp', 'fee', 'Reminder: your fee of Rs. 1200 is pending. Please pay before the due date.', 'sent', formatFut(-1) + ' 09:00:00');
    insertNotification.run(studentIds[4], 'sms', 'class', 'Reminder: CS105 class tomorrow at 10:00. Don\'t forget!', 'sent', formatFut(-1) + ' 09:05:00');
  }

  // ---- Staff ----
  if (count('staff') === 0) {
    const insertStaff = db.prepare(
      'INSERT INTO staff (branch_id, name, role, phone, email, salary, salary_type, join_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const sbid = defBranchId();
    insertStaff.run(sbid, 'Sunita Deshmukh', 'Office Manager', '+91 98200 12345', 'office@vumcahitech.io', 18000, 'monthly', '2024-06-01', 'active');
    insertStaff.run(sbid, 'Rahul Kulkarni', 'Accountant', '+91 98200 54321', 'accounts@vumcahitech.io', 15000, 'monthly', '2024-08-15', 'active');
    insertStaff.run(sbid, 'Priya Nair', 'Front Desk', '+91 98200 98765', 'frontdesk@vumcahitech.io', 12000, 'monthly', '2025-01-05', 'active');
  }

  // ---- Expenses ----
  if (count('expenses') === 0) {
    const insertExpense = db.prepare(
      'INSERT INTO expenses (branch_id, category, amount, note, expense_date) VALUES (?, ?, ?, ?, ?)'
    );
    const ebid = defBranchId();
    insertExpense.run(ebid, 'Rent', 25000, 'Monthly premises rent', formatFut(-18));
    insertExpense.run(ebid, 'Electricity', 3200, 'Utility bill', formatFut(-15));
    insertExpense.run(ebid, 'Internet', 999, 'Broadband + backup line', formatFut(-12));
    insertExpense.run(ebid, 'Stationery', 1450, 'Printing and paper', formatFut(-9));
  }
}

migrate();
ensureBranch();
seed();
seedModules();

module.exports = db;
