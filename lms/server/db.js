const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'lms.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    instructor TEXT,
    weeks INTEGER DEFAULT 12,
    level TEXT DEFAULT 'Beginner'
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TEXT DEFAULT (datetime('now')),
    UNIQUE(student_id, course_id)
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

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return;

  const insertUser = db.prepare(
    'INSERT INTO users (role, username, password_hash, name, email) VALUES (?, ?, ?, ?, ?)'
  );

  const adminHash = bcrypt.hashSync('admin123', 10);
  insertUser.run('admin', 'admin', adminHash, 'System Administrator', 'admin@vumcahitech.io');

  const studentData = [
    ['STU001', 'Aarav Sharma', 'aarav@example.com', 'student123'],
    ['STU002', 'Meera Patel', 'meera@example.com', 'student123'],
    ['STU003', 'John Carter', 'john@example.com', 'student123'],
    ['STU004', 'Lina Chen', 'lina@example.com', 'student123'],
    ['STU005', 'Diego Morales', 'diego@example.com', 'student123'],
    ['STU006', 'Fatima Noor', 'fatima@example.com', 'student123'],
  ];

  const studentIds = [];
  for (const [username, name, email, pass] of studentData) {
    const hash = bcrypt.hashSync(pass, 10);
    const res = insertUser.run('student', username, hash, name, email);
    studentIds.push(res.lastInsertRowid);
  }

  const insertCourse = db.prepare(
    'INSERT INTO courses (code, title, description, instructor, weeks, level) VALUES (?, ?, ?, ?, ?, ?)'
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
    const res = insertCourse.run(...c);
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

seed();

module.exports = db;
