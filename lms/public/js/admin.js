let currentUser = null;
let submissionsAssignmentId = null;
let editingQuiz = null;

const tabTitles = {
  dashboard: ['// ADMIN / OVERVIEW', 'Command Center'],
  students: ['// ADMIN / STUDENTS', 'Student Records'],
  courses: ['// ADMIN / COURSES', 'Course Catalog'],
  enrollments: ['// ADMIN / ENROLLMENTS', 'Enrollment Matrix'],
  assignments: ['// ADMIN / ASSIGNMENTS', 'Assignments'],
  quizzes: ['// ADMIN / QUIZZES', 'Quizzes'],
  attendance: ['// ADMIN / ATTENDANCE', 'Attendance Tracker'],
};

(async function init() {
  currentUser = await requireAuth('admin');
  if (!currentUser) return;
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userId').textContent = '@' + currentUser.username;

  document.getElementById('sideNav').querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('quickAddBtn').addEventListener('click', () => {
    const active = document.querySelector('.nav-item.active');
    const tab = active.dataset.tab;
    if (tab === 'students') openStudentModal();
    else if (tab === 'courses') openCourseModal();
    else if (tab === 'assignments') openAssignmentModal();
    else if (tab === 'quizzes') openQuizModal();
    else if (tab === 'enrollments') openEnrollmentModal();
  });

  switchTab('dashboard');
  document.getElementById('attDate').value = todayStr();
})();

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');

  const [tag, title] = tabTitles[tab];
  document.getElementById('pageTag').textContent = tag;
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('quickAddBtn').style.display =
    tab === 'dashboard' || tab === 'attendance' ? 'none' : 'inline-flex';

  if (tab === 'dashboard') loadStats();
  else if (tab === 'students') loadStudents();
  else if (tab === 'courses') loadCourses();
  else if (tab === 'enrollments') loadEnrollments();
  else if (tab === 'assignments') loadAssignments();
  else if (tab === 'quizzes') loadQuizzes();
  else if (tab === 'attendance') loadAttendance();
}

// ---------- Dashboard ----------
async function loadStats() {
  const s = await api('/api/admin/stats');
  const cards = [
    { label: 'Students', value: s.students },
    { label: 'Courses', value: s.courses },
    { label: 'Assignments', value: s.assignments },
    { label: 'Quizzes', value: s.quizzes },
    { label: 'Enrollments', value: s.enrollments, cls: 'purple' },
    { label: 'Submissions', value: s.submissions, cls: 'purple' },
    { label: 'Present Today', value: s.presentToday, cls: 'green' },
  ];
  document.getElementById('statGrid').innerHTML = cards.map(c => `
    <div class="stat-card ${c.cls || ''}">
      <div class="stat-num">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');

  const rows = [
    ['Active students', s.students, 'ONLINE', 'green'],
    ['Course catalog', s.courses, 'LOADED', 'cyan'],
    ['Assignment submissions', `${s.submissions} total`, s.submissions > 0 ? 'REVIEW' : 'PENDING', 'yellow'],
    ['Quiz attempts', s.quizzes + ' quizzes published', 'LIVE', 'purple'],
    ['Attendance today', s.presentToday + ' present', s.presentToday > 0 ? 'LOGGED' : 'NO DATA', 'cyan'],
  ];
  document.getElementById('activityRows').innerHTML = rows.map(r => `
    <tr>
      <td>${r[0]}</td>
      <td>${r[1]}</td>
      <td><span class="badge badge-${r[3]}">${r[2]}</span></td>
    </tr>
  `).join('');
}

// ---------- Students ----------
async function loadStudents() {
  const students = await api('/api/admin/students');
  document.getElementById('studentRows').innerHTML = students.length ? students.map(s => `
    <tr>
      <td><span class="badge badge-cyan">${esc(s.username)}</span></td>
      <td><strong>${esc(s.name)}</strong></td>
      <td class="muted">${esc(s.email || '—')}</td>
      <td class="muted">${esc(s.mobile || '—')}</td>
      <td>${s.course_count}</td>
      <td>${s.present_days}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick='openStudentModal(${JSON.stringify(s)})'>EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteStudent(${s.id}, '${esc(s.name)}')">DELETE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">▣</span>No students registered yet.</div></td></tr>';
}

function openStudentModal(student) {
  const isEdit = !!student;
  showModal(isEdit ? 'Edit Student' : 'Add Student', `
    <form id="studentForm">
      <div class="form-grid">
        <div class="field ${isEdit ? 'span-2' : ''}">
          <label>Full Name</label>
          <input type="text" name="name" required value="${esc(student ? student.name : '')}" placeholder="e.g. Alex Johnson">
        </div>
        ${isEdit ? '' : `
        <div class="field">
          <label>Student ID / Username</label>
          <input type="text" name="username" required placeholder="e.g. STU007">
        </div>
        <div class="field">
          <label>Password</label>
          <input type="text" name="password" required placeholder="Initial password">
        </div>
        `}
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" value="${esc(student ? student.email || '' : '')}" placeholder="student@example.com">
        </div>
        <div class="field">
          <label>Mobile Number</label>
          <input type="tel" name="mobile" value="${esc(student ? student.mobile || '' : '')}" placeholder="e.g. +91 98765 43210">
        </div>
        ${isEdit ? `
        <div class="field span-2">
          <label>Reset Password (leave blank to keep)</label>
          <input type="text" name="password" placeholder="New password">
        </div>` : ''}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${isEdit ? 'SAVE CHANGES' : 'CREATE STUDENT'}</button>
      </div>
    </form>
  `);

  document.getElementById('studentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const payload = { name: f.get('name'), email: f.get('email'), mobile: f.get('mobile') };
    try {
      if (isEdit) {
        if (f.get('password')) payload.password = f.get('password');
        await api('/api/admin/students/' + student.id, { method: 'PUT', body: payload });
      } else {
        await api('/api/admin/students', { method: 'POST', body: {
          username: f.get('username'), password: f.get('password'),
          name: f.get('name'), email: f.get('email'), mobile: f.get('mobile'),
        }});
      }
      toast(isEdit ? 'Student updated' : 'Student created');
      closeModal();
      loadStudents();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteStudent(id, name) {
  if (!confirm(`Delete student "${name}"? This removes all their data.`)) return;
  try {
    await api('/api/admin/students/' + id, { method: 'DELETE' });
    toast('Student deleted');
    loadStudents();
  } catch (err) { toast(err.message, true); }
}

// ---------- Courses ----------
async function loadCourses() {
  const courses = await api('/api/admin/courses');
  document.getElementById('courseRows').innerHTML = courses.length ? courses.map(c => `
    <tr>
      <td><span class="badge badge-cyan">${esc(c.code)}</span></td>
      <td><strong>${esc(c.title)}</strong><div class="muted">${esc(c.description || '')}</div></td>
      <td>${esc(c.instructor || '—')}</td>
      <td><span class="badge badge-purple">${esc(c.level)}</span></td>
      <td>${c.weeks}</td>
      <td>${c.student_count}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick='openCourseModal(${JSON.stringify(c)})'>EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCourse(${c.id}, '${esc(c.code)}')">DELETE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">⬡</span>No courses yet.</div></td></tr>';
}

function openCourseModal(course) {
  const isEdit = !!course;
  showModal(isEdit ? 'Edit Course' : 'Add Course', `
    <form id="courseForm">
      <div class="form-grid">
        <div class="field">
          <label>Course Code</label>
          <input type="text" name="code" required value="${esc(course ? course.code : '')}" placeholder="e.g. CS401">
        </div>
        <div class="field">
          <label>Title</label>
          <input type="text" name="title" required value="${esc(course ? course.title : '')}" placeholder="e.g. Cloud & DevOps">
        </div>
        <div class="field span-2">
          <label>Description</label>
          <textarea name="description" rows="2" placeholder="Course summary">${esc(course ? course.description || '' : '')}</textarea>
        </div>
        <div class="field">
          <label>Instructor</label>
          <input type="text" name="instructor" value="${esc(course ? course.instructor || '' : '')}" placeholder="e.g. Dr. Alan Vega">
        </div>
        <div class="field">
          <label>Level</label>
          <select name="level">
            <option ${course && course.level === 'Beginner' ? 'selected' : ''}>Beginner</option>
            <option ${course && course.level === 'Intermediate' ? 'selected' : ''}>Intermediate</option>
            <option ${course && course.level === 'Advanced' ? 'selected' : ''}>Advanced</option>
          </select>
        </div>
        <div class="field">
          <label>Duration (weeks)</label>
          <input type="number" name="weeks" min="1" value="${course ? course.weeks : 12}">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${isEdit ? 'SAVE CHANGES' : 'CREATE COURSE'}</button>
      </div>
    </form>
  `);

  document.getElementById('courseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const payload = {
      code: f.get('code'), title: f.get('title'), description: f.get('description'),
      instructor: f.get('instructor'), level: f.get('level'), weeks: Number(f.get('weeks')) || 12,
    };
    try {
      if (isEdit) {
        await api('/api/admin/courses/' + course.id, { method: 'PUT', body: payload });
      } else {
        await api('/api/admin/courses', { method: 'POST', body: payload });
      }
      toast(isEdit ? 'Course updated' : 'Course created');
      closeModal();
      loadCourses();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteCourse(id, code) {
  if (!confirm(`Delete course ${code}? This removes its assignments, quizzes and enrollments.`)) return;
  try {
    await api('/api/admin/courses/' + id, { method: 'DELETE' });
    toast('Course deleted');
    loadCourses();
  } catch (err) { toast(err.message, true); }
}

// ---------- Enrollments ----------
async function loadEnrollments() {
  const [enrollments, students, courses] = await Promise.all([
    api('/api/admin/enrollments'),
    api('/api/admin/students'),
    api('/api/admin/courses'),
  ]);
  window._students = students;
  window._courses = courses;
  document.getElementById('enrollmentRows').innerHTML = enrollments.length ? enrollments.map(e => `
    <tr>
      <td><strong>${esc(e.student_name)}</strong> <span class="muted">(${esc(e.username)})</span></td>
      <td>${esc(e.course_code)} — <span class="muted">${esc(e.course_title)}</span></td>
      <td class="muted">${esc(e.enrolled_at || '')}</td>
      <td class="table-actions">
        <button class="btn btn-danger btn-sm" onclick="deleteEnrollment(${e.id})">REMOVE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="4"><div class="empty-state"><span class="es-icon">⇄</span>No enrollments yet.</div></td></tr>';
}

function openEnrollmentModal() {
  showModal('Enroll Student', `
    <form id="enrollmentForm">
      <div class="field">
        <label>Student</label>
        <select name="student_id" required>
          <option value="">Select student...</option>
          ${(window._students || []).map(s => `<option value="${s.id}">${esc(s.name)} (${esc(s.username)})</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Course</label>
        <select name="course_id" required>
          <option value="">Select course...</option>
          ${(window._courses || []).map(c => `<option value="${c.id}">${esc(c.code)} — ${esc(c.title)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">ENROLL</button>
      </div>
    </form>
  `);

  document.getElementById('enrollmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/admin/enrollments', { method: 'POST', body: {
        student_id: Number(f.get('student_id')), course_id: Number(f.get('course_id')),
      }});
      toast('Student enrolled');
      closeModal();
      loadEnrollments();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteEnrollment(id) {
  if (!confirm('Remove this enrollment?')) return;
  try {
    await api('/api/admin/enrollments/' + id, { method: 'DELETE' });
    toast('Enrollment removed');
    loadEnrollments();
  } catch (err) { toast(err.message, true); }
}

// ---------- Assignments ----------
async function loadAssignments() {
  const assignments = await api('/api/admin/assignments');
  document.getElementById('assignmentRows').innerHTML = assignments.length ? assignments.map(a => `
    <tr>
      <td><strong>${esc(a.title)}</strong><div class="muted">${esc(a.description || '')}</div></td>
      <td><span class="badge badge-cyan">${esc(a.course_code)}</span></td>
      <td class="muted">${esc(a.due_date || '—')}</td>
      <td>${a.max_score}</td>
      <td>${a.submitted_count}/${a.enrolled_count} <button class="btn btn-ghost btn-sm" onclick="showSubmissions(${a.id}, '${esc(a.title)}')">VIEW</button></td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick='openAssignmentModal(${JSON.stringify(a)})'>EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAssignment(${a.id}, '${esc(a.title)}')">DELETE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">✎</span>No assignments yet.</div></td></tr>';
}

function openAssignmentModal(assignment) {
  const isEdit = !!assignment;
  showModal(isEdit ? 'Edit Assignment' : 'Add Assignment', `
    <form id="assignmentForm">
      <div class="form-grid">
        <div class="field span-2">
          <label>Title</label>
          <input type="text" name="title" required value="${esc(assignment ? assignment.title : '')}" placeholder="e.g. Python Basics Lab">
        </div>
        <div class="field span-2">
          <label>Description</label>
          <textarea name="description" rows="3" placeholder="Instructions for students...">${esc(assignment ? assignment.description || '' : '')}</textarea>
        </div>
        <div class="field">
          <label>Course</label>
          <select name="course_id" required>
            ${(window._courses || []).map(c => `<option value="${c.id}" ${assignment && assignment.course_id === c.id ? 'selected' : ''}>${esc(c.code)} — ${esc(c.title)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Due Date</label>
          <input type="date" name="due_date" value="${esc(assignment ? assignment.due_date || '' : '')}">
        </div>
        <div class="field">
          <label>Max Score</label>
          <input type="number" name="max_score" min="1" value="${assignment ? assignment.max_score : 100}">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${isEdit ? 'SAVE CHANGES' : 'CREATE ASSIGNMENT'}</button>
      </div>
    </form>
  `);

  if (!isEdit && window._courses && window._courses.length === 0) {
    toast('Create a course first', true);
    return;
  }

  document.getElementById('assignmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const payload = {
      course_id: Number(f.get('course_id')), title: f.get('title'),
      description: f.get('description'), due_date: f.get('due_date') || null,
      max_score: Number(f.get('max_score')) || 100,
    };
    try {
      if (isEdit) {
        await api('/api/admin/assignments/' + assignment.id, { method: 'PUT', body: payload });
      } else {
        await api('/api/admin/assignments', { method: 'POST', body: payload });
      }
      toast(isEdit ? 'Assignment updated' : 'Assignment created');
      closeModal();
      loadAssignments();
    } catch (err) { toast(err.message, true); }
  });
}

async function showSubmissions(id, title) {
  const submissions = await api(`/api/admin/assignments/${id}/submissions`);
  submissionsAssignmentId = id;
  document.getElementById('submissionsTitle').textContent = 'Submissions — ' + title;
  document.getElementById('submissionsPanel').style.display = 'block';
  document.getElementById('submissionRows').innerHTML = submissions.length ? submissions.map(s => `
    <tr>
      <td><strong>${esc(s.student_name)}</strong> <span class="muted">(${esc(s.username)})</span></td>
      <td class="muted">${esc(s.content || '—')}</td>
      <td class="muted">${esc(s.submitted_at || '')}</td>
      <td>
        <input type="number" id="score-${s.id}" min="0" max="100" value="${s.score != null ? s.score : ''}"
               placeholder="—" style="width:70px;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:5px">
      </td>
      <td><button class="btn btn-purple btn-sm" onclick="gradeSubmission(${s.id})">GRADE</button></td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">✎</span>No submissions yet.</div></td></tr>';
}

function closeSubmissions() {
  submissionsAssignmentId = null;
  document.getElementById('submissionsPanel').style.display = 'none';
}

async function gradeSubmission(id) {
  const score = document.getElementById('score-' + id).value;
  if (score === '') return toast('Enter a score', true);
  try {
    await api(`/api/admin/assignments/${submissionsAssignmentId}/submissions/${id}/grade`, {
      method: 'POST', body: { score: Number(score) },
    });
    toast('Grade saved');
    showSubmissions(submissionsAssignmentId, document.getElementById('submissionsTitle').textContent.replace('Submissions — ', ''));
    loadAssignments();
  } catch (err) { toast(err.message, true); }
}

async function deleteAssignment(id, title) {
  if (!confirm(`Delete assignment "${title}"?`)) return;
  try {
    await api('/api/admin/assignments/' + id, { method: 'DELETE' });
    toast('Assignment deleted');
    loadAssignments();
  } catch (err) { toast(err.message, true); }
}

// ---------- Quizzes ----------
async function loadQuizzes() {
  const quizzes = await api('/api/admin/quizzes');
  document.getElementById('quizRows').innerHTML = quizzes.length ? quizzes.map(q => `
    <tr>
      <td><strong>${esc(q.title)}</strong></td>
      <td><span class="badge badge-cyan">${esc(q.course_code)}</span></td>
      <td>${q.question_count}</td>
      <td>${q.attempt_count}</td>
      <td class="muted">${q.time_limit} min</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick='editQuiz(${q.id})'>EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteQuiz(${q.id}, '${esc(q.title)}')">DELETE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">◎</span>No quizzes yet.</div></td></tr>';
}

function openQuizModal() {
  editingQuiz = null;
  renderQuizForm(null, []);
}

async function editQuiz(id) {
  const quiz = await api('/api/admin/quizzes/' + id);
  editingQuiz = quiz;
  renderQuizForm(quiz, quiz.questions);
}

function renderQuizForm(quiz, questions) {
  showModal(quiz ? 'Edit Quiz' : 'Add Quiz', `
    <form id="quizForm">
      <div class="form-grid">
        <div class="field span-2">
          <label>Title</label>
          <input type="text" name="title" required value="${esc(quiz ? quiz.title : '')}" placeholder="e.g. Python Fundamentals Quiz">
        </div>
        <div class="field span-2">
          <label>Description</label>
          <input type="text" name="description" value="${esc(quiz ? quiz.description || '' : '')}" placeholder="Short description">
        </div>
        <div class="field">
          <label>Course</label>
          <select name="course_id" required>
            ${(window._courses || []).map(c => `<option value="${c.id}" ${quiz && quiz.course_id === c.id ? 'selected' : ''}>${esc(c.code)} — ${esc(c.title)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Time Limit (min)</label>
          <input type="number" name="time_limit" min="1" value="${quiz ? quiz.time_limit : 15}">
        </div>
      </div>
      <div class="panel-header" style="margin-top:6px">
        <h2>Questions</h2>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-ghost btn-small" onclick="toggleAiPanel()">⚡ GENERATE WITH AI</button>
          <button type="button" class="btn btn-ghost btn-small" onclick="addQuestion()">+ ADD QUESTION</button>
        </div>
      </div>
      <div class="panel" id="aiPanel" style="display:none;margin-bottom:14px;border-color:var(--purple)">
        <div class="panel-header" style="margin-bottom:12px">
          <h2>AI Quiz Generator</h2>
          <span class="badge badge-purple" id="aiStatusBadge">checking...</span>
        </div>
        <div class="form-grid">
          <div class="field span-2">
            <label>Topic</label>
            <input type="text" id="aiTopic" placeholder="e.g. Python functions and loops">
          </div>
          <div class="field">
            <label>Number of Questions</label>
            <input type="number" id="aiCount" min="1" max="20" value="5">
          </div>
          <div class="field">
            <label>Difficulty</label>
            <select id="aiDifficulty">
              <option>easy</option>
              <option selected>medium</option>
              <option>hard</option>
            </select>
          </div>
        </div>
        <div class="modal-actions" style="margin-top:6px">
          <button type="button" class="btn btn-ghost" onclick="toggleAiPanel()">CANCEL</button>
          <button type="button" class="btn btn-purple" id="aiGenerateBtn" onclick="generateQuizWithAI()">GENERATE QUESTIONS</button>
        </div>
      </div>
      <div id="questionList"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${quiz ? 'SAVE CHANGES' : 'PUBLISH QUIZ'}</button>
      </div>
    </form>
  `);

  if (questions && questions.length) {
    questions.forEach(q => addQuestion(q.text, q.options, q.correct_index));
  } else {
    addQuestion();
  }

  document.getElementById('quizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const qs = [];
    document.querySelectorAll('.qb-question').forEach(el => {
      const text = el.querySelector('input[name="q_text"]').value.trim();
      const opts = [...el.querySelectorAll('input[name="q_opt"]')].map(i => i.value.trim());
      const correct = Number(el.querySelector('select[name="q_correct"]').value) || 0;
      if (text && opts.filter(Boolean).length >= 2) qs.push({ text, options: opts, correct_index: correct });
    });
    if (qs.length === 0) return toast('Add at least one question with 2+ options', true);

    const payload = {
      course_id: Number(f.get('course_id')), title: f.get('title'),
      description: f.get('description'), time_limit: Number(f.get('time_limit')) || 15,
      questions: qs,
    };
    try {
      if (editingQuiz) {
        await api('/api/admin/quizzes/' + editingQuiz.id, { method: 'PUT', body: payload });
      } else {
        await api('/api/admin/quizzes', { method: 'POST', body: payload });
      }
      toast(editingQuiz ? 'Quiz updated' : 'Quiz published');
      closeModal();
      loadQuizzes();
    } catch (err) { toast(err.message, true); }
  });
}

async function checkAiStatus() {
  try {
    const { configured } = await api('/api/admin/ai/status');
    const badge = document.getElementById('aiStatusBadge');
    if (badge) {
      badge.textContent = configured ? 'AI READY' : 'NOT CONFIGURED';
      badge.classList.toggle('badge-purple', configured);
      badge.classList.toggle('badge-yellow', !configured);
    }
  } catch (_) {}
}

function toggleAiPanel() {
  const panel = document.getElementById('aiPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  if (panel.style.display === 'block') checkAiStatus();
}

async function generateQuizWithAI() {
  const topic = document.getElementById('aiTopic').value.trim();
  const count = Number(document.getElementById('aiCount').value) || 5;
  const difficulty = document.getElementById('aiDifficulty').value;
  const btn = document.getElementById('aiGenerateBtn');
  if (!topic) return toast('Enter a topic first', true);

  btn.disabled = true;
  btn.textContent = 'GENERATING...';
  try {
    const { questions } = await api('/api/admin/quizzes/generate', {
      method: 'POST',
      body: { topic, count, difficulty },
    });
    document.getElementById('questionList').innerHTML = '';
    questions.forEach(q => addQuestion(q.text, q.options, q.correct_index));
    toast(`AI generated ${questions.length} questions - review and publish`);
    document.getElementById('aiPanel').style.display = 'none';
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'GENERATE QUESTIONS';
  }
}

function addQuestion(text = '', options = ['', ''], correct = 0) {
  const list = document.getElementById('questionList');
  const qIdx = list.querySelectorAll('.qb-question').length;
  const wrapper = document.createElement('div');
  wrapper.className = 'qb-question';
  wrapper.innerHTML = `
    <div class="qb-head">
      <span class="badge badge-cyan">Q${qIdx + 1}</span>
      <input type="text" name="q_text" placeholder="Question text..." value="${esc(text)}">
      <button type="button" class="qb-remove" title="Remove question">&times;</button>
    </div>
    ${options.map((o, i) => `
      <div class="opt-row">
        <span style="color:var(--text-muted);font-size:12px">${String.fromCharCode(65 + i)}</span>
        <input type="text" name="q_opt" placeholder="Option ${String.fromCharCode(65 + i)}" value="${esc(o)}">
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--cyan);white-space:nowrap">
          <input type="radio" name="q_correct_${qIdx}" data-opt="${i}" ${i === correct ? 'checked' : ''} style="accent-color:var(--cyan)"> Correct
        </label>
      </div>
    `).join('')}
    <div class="opt-row">
      <button type="button" class="btn btn-ghost btn-sm" onclick="addOption(this)">+ ADD OPTION</button>
    </div>
  `;
  list.appendChild(wrapper);

  wrapper.querySelector('.qb-remove').addEventListener('click', () => wrapper.remove());
  wrapper.querySelectorAll('input[data-opt]').forEach(radio => {
    radio.addEventListener('change', () => {
      const select = wrapper.querySelector('select[name="q_correct"]');
      if (select) select.value = radio.dataset.opt;
    });
  });

  // Keep hidden select synced for correct_index
  const select = document.createElement('select');
  select.name = 'q_correct';
  select.classList.add('hidden');
  options.forEach((_, i) => {
    const op = document.createElement('option');
    op.value = i;
    op.textContent = i;
    select.appendChild(op);
  });
  select.value = correct;
  wrapper.appendChild(select);
  wrapper.querySelectorAll('input[data-opt]').forEach(radio => {
    radio.addEventListener('change', () => { select.value = radio.dataset.opt; });
  });
}

function addOption(btn) {
  const wrapper = btn.closest('.qb-question');
  const radios = wrapper.querySelectorAll('input[data-opt]');
  const idx = radios.length;
  const row = document.createElement('div');
  row.className = 'opt-row';
  row.innerHTML = `
    <span style="color:var(--text-muted);font-size:12px">${String.fromCharCode(65 + idx)}</span>
    <input type="text" name="q_opt" placeholder="Option ${String.fromCharCode(65 + idx)}">
    <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--cyan);white-space:nowrap">
      <input type="radio" name="q_correct_${wrapper.querySelectorAll('.qb-question').length}" data-opt="${idx}" style="accent-color:var(--cyan)"> Correct
    </label>
  `;
  const select = wrapper.querySelector('select[name="q_correct"]');
  const op = document.createElement('option');
  op.value = idx;
  op.textContent = idx;
  select.appendChild(op);
  row.querySelector('input[data-opt]').addEventListener('change', () => { select.value = idx; });
  btn.closest('.opt-row').insertAdjacentElement('beforebegin', row);
}

async function deleteQuiz(id, title) {
  if (!confirm(`Delete quiz "${title}"?`)) return;
  try {
    await api('/api/admin/quizzes/' + id, { method: 'DELETE' });
    toast('Quiz deleted');
    loadQuizzes();
  } catch (err) { toast(err.message, true); }
}

// ---------- Attendance ----------
async function loadAttendance() {
  const date = document.getElementById('attDate').value || todayStr();
  const { records } = await api('/api/admin/attendance');
  const courses = await api('/api/admin/courses');
  const view = document.getElementById('attendanceView');

  const todayRecords = records.filter(r => r.date === date);
  const byCourse = {};
  for (const r of todayRecords) {
    if (!byCourse[r.course_id]) byCourse[r.course_id] = {};
    byCourse[r.course_id][r.student_id] = r.status;
  }

  if (courses.length === 0) {
    view.innerHTML = '<div class="empty-state"><span class="es-icon">✓</span>Create courses before marking attendance.</div>';
    return;
  }

  let html = '';
  for (const c of courses) {
    const enrolled = records.filter(r => r.course_id === c.id);
    const students = [...new Map(enrolled.map(r => [r.student_id, { id: r.student_id, name: r.student_name }])).values()];
    const marks = byCourse[c.id] || {};
    html += `
      <div class="panel" style="margin-bottom:16px">
        <div class="panel-header">
          <h2>${esc(c.code)} — ${esc(c.title)}</h2>
          <span class="badge badge-cyan">${students.length} students</span>
        </div>
        <div class="att-grid">
          ${students.length ? students.map(s => {
            const status = marks[s.id] || 'present';
            return `
            <div class="att-card" data-student="${s.id}" data-course="${c.id}">
              <div class="att-name">${esc(s.name)}</div>
              <div class="att-meta">Mark attendance for ${esc(date)}</div>
              <div class="att-actions">
                <button class="att-btn present ${status === 'present' ? 'active-present' : ''}" data-status="present">P</button>
                <button class="att-btn late ${status === 'late' ? 'active-late' : ''}" data-status="late">L</button>
                <button class="att-btn absent ${status === 'absent' ? 'active-absent' : ''}" data-status="absent">A</button>
              </div>
            </div>`;
          }).join('') : '<div class="empty-state">No students enrolled.</div>'}
        </div>
      </div>`;
  }
  view.innerHTML = html;

  view.querySelectorAll('.att-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.att-card');
      const status = btn.dataset.status;
      try {
        await api('/api/admin/attendance', { method: 'POST', body: {
          student_id: Number(card.dataset.student),
          course_id: Number(card.dataset.course),
          date, status,
        }});
        card.querySelectorAll('.att-btn').forEach(b => {
          b.classList.remove('active-present', 'active-late', 'active-absent');
        });
        btn.classList.add('active-' + status);
        toast(`${status.toUpperCase()} saved for ${card.querySelector('.att-name').textContent}`);
      } catch (err) { toast(err.message, true); }
    });
  });
}

// ---------- Modal helpers ----------
function showModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalBody').innerHTML = '';
}
