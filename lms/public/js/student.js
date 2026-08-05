let currentUser = null;
let activeQuiz = null;

const tabTitles = {
  dashboard: ['// STUDENT / OVERVIEW', 'My Dashboard'],
  courses: ['// STUDENT / COURSES', 'My Courses'],
  timetable: ['// STUDENT / TIMETABLE', 'Weekly Timetable'],
  assignments: ['// STUDENT / ASSIGNMENTS', 'Assignments'],
  quizzes: ['// STUDENT / QUIZZES', 'Quizzes'],
  exams: ['// STUDENT / EXAMS', 'Exams & Results'],
  attendance: ['// STUDENT / ATTENDANCE', 'Attendance'],
  grades: ['// STUDENT / GRADES', 'Grades & Results'],
  fees: ['// STUDENT / FEES', 'Fees & Payments'],
  certificates: ['// STUDENT / CERTIFICATES', 'My Certificates'],
};

(async function init() {
  currentUser = await requireAuth('student');
  if (!currentUser) return;
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userId').textContent = '@' + currentUser.username;

  document.getElementById('sideNav').querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  switchTab('dashboard');
})();

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');

  const [tag, title] = tabTitles[tab];
  document.getElementById('pageTag').textContent = tag;
  document.getElementById('pageTitle').textContent = title;

  if (tab === 'dashboard') loadDashboard();
  else if (tab === 'courses') loadCourses();
  else if (tab === 'timetable') loadTimetable();
  else if (tab === 'assignments') loadAssignments();
  else if (tab === 'quizzes') loadQuizzes();
  else if (tab === 'exams') loadExams();
  else if (tab === 'attendance') loadAttendance();
  else if (tab === 'grades') loadGrades();
  else if (tab === 'fees') loadFees();
  else if (tab === 'certificates') loadCertificates();
}

async function loadDashboard() {
  const [courses, assignments] = await Promise.all([
    api('/api/student/courses'),
    api('/api/student/assignments'),
  ]);

  const pending = assignments.filter(a => !a.is_submitted);
  const graded = assignments.filter(a => a.is_submitted && a.score != null);
  const attendance = await api('/api/student/attendance');
  const present = attendance.filter(a => a.status === 'present').length;

  const cards = [
    { label: 'Courses', value: courses.length, cls: '' },
    { label: 'Pending Tasks', value: pending.length, cls: 'purple' },
    { label: 'Graded', value: graded.length, cls: 'green' },
    { label: 'Present Days', value: present, cls: 'green' },
  ];
  document.getElementById('statGrid').innerHTML = cards.map(c => `
    <div class="stat-card ${c.cls || ''}">
      <div class="stat-num">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');

  document.getElementById('dashCourses').innerHTML = courses.length ? courses.map(c => `
    <div class="course-card">
      <div class="cc-top">
        <span class="course-code">${esc(c.code)}</span>
        <span class="badge badge-purple">${esc(c.level)}</span>
      </div>
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.description || '')}</p>
      <div class="course-meta">
        <span class="badge badge-cyan">${c.assignment_count} assignments</span>
        <span class="badge badge-cyan">${c.quiz_count} quizzes</span>
      </div>
    </div>
  `).join('') : '<div class="empty-state" style="grid-column:1/-1"><span class="es-icon">⬡</span>You are not enrolled in any courses yet. Contact your administrator.</div>';
}

async function loadCourses() {
  const courses = await api('/api/student/courses');
  document.getElementById('courseGrid').innerHTML = courses.length ? courses.map(c => `
    <div class="course-card">
      <div class="cc-top">
        <span class="course-code">${esc(c.code)}</span>
        <span class="badge badge-purple">${esc(c.level)}</span>
      </div>
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.description || '')}</p>
      <div class="course-meta">
        <span class="badge badge-cyan">${c.weeks} weeks</span>
        <span class="badge badge-green">${esc(c.instructor || 'TBA')}</span>
      </div>
      <div class="progress">
        <div class="progress-bar" style="width:${Math.min(100, c.assignment_count ? 50 : 25)}%"></div>
      </div>
    </div>
  `).join('') : '<div class="empty-state"><span class="es-icon">⬡</span>No courses enrolled.</div>';
}

async function loadTimetable() {
  const timetable = await api('/api/student/timetable');
  document.getElementById('timetableRows').innerHTML = timetable.length ? timetable.map(t => `
    <tr>
      <td class="muted">${esc(t.day)}</td>
      <td class="muted">${esc(t.start_time)} — ${esc(t.end_time)}</td>
      <td><strong>${esc(t.subject)}</strong></td>
      <td><span class="badge badge-cyan">${esc(t.batch_name)}</span></td>
      <td>${esc(t.course_code)}</td>
      <td class="muted">${esc(t.instructor || '—')}</td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">⧉</span>You have not been assigned to any batches yet.</div></td></tr>';
}

async function loadExams() {
  const exams = await api('/api/student/exams');
  document.getElementById('examRows').innerHTML = exams.length ? exams.map(x => {
    const resultBadge = x.marks != null
      ? `<span class="badge ${(x.marks / x.max_marks) >= 0.7 ? 'badge-green' : (x.marks / x.max_marks) >= 0.5 ? 'badge-yellow' : 'badge-red'}">${x.marks}/${x.max_marks}</span>`
      : '<span class="badge badge-yellow">PENDING</span>';
    return `
    <tr>
      <td><strong>${esc(x.title)}</strong></td>
      <td><span class="badge badge-cyan">${esc(x.course_code)}</span> <span class="muted">${esc(x.course_title)}</span></td>
      <td class="muted">${esc(x.exam_date || '—')}</td>
      <td>${x.max_marks}</td>
      <td>${resultBadge}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">▤</span>No exams scheduled in your courses.</div></td></tr>';
}

async function loadFees() {
  const d = await api('/api/student/fees');
  document.getElementById('feeStatGrid').innerHTML = `
    <div class="stat-card purple"><div class="stat-num">${fmtMoney(d.fee_amount)}</div><div class="stat-label">Total Fee</div></div>
    <div class="stat-card green"><div class="stat-num">${fmtMoney(d.total_paid)}</div><div class="stat-label">Paid</div></div>
    <div class="stat-card ${d.pending > 0 ? 'red' : 'green'}"><div class="stat-num">${fmtMoney(d.pending)}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-num">${d.fee_paid ? 'PAID' : 'PENDING'}</div><div class="stat-label">Status</div></div>
  `;
  document.getElementById('paymentRows').innerHTML = d.payments.length ? d.payments.map(p => `
    <tr>
      <td><span class="badge badge-cyan">${esc(p.receipt_no)}</span></td>
      <td class="muted">${esc(p.paid_at || '')}</td>
      <td class="muted">${esc(p.method || '')}</td>
      <td class="muted">${esc(p.note || '—')}</td>
      <td><strong>${fmtMoney(p.amount)}</strong></td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">₿</span>No payments recorded. See the office if you have paid.</div></td></tr>';
}

async function loadCertificates() {
  const certs = await api('/api/student/certificates');
  document.getElementById('certificateRows').innerHTML = certs.length ? certs.map(c => `
    <tr>
      <td><span class="badge badge-cyan">${esc(c.cert_no)}</span></td>
      <td>${esc(c.course_code)} — <span class="muted">${esc(c.course_title)}</span></td>
      <td><span class="badge badge-purple">${esc(c.type)}</span></td>
      <td class="muted">${esc(c.issued_date || '')}</td>
    </tr>
  `).join('') : '<tr><td colspan="4"><div class="empty-state"><span class="es-icon">⛁</span>No certificates issued yet.</div></td></tr>';
}

function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function loadAssignments() {
  const assignments = await api('/api/student/assignments');
  document.getElementById('assignmentRows').innerHTML = assignments.length ? assignments.map(a => {
    const dueDate = new Date(a.due_date);
    const today = new Date();
    const overdue = !a.is_submitted && dueDate && dueDate < today;
    const statusBadge = a.is_submitted
      ? `<span class="badge badge-green">${a.score != null ? `GRADED ${a.score}/${a.max_score}` : 'SUBMITTED'}</span>`
      : overdue
        ? '<span class="badge badge-red">OVERDUE</span>'
        : '<span class="badge badge-yellow">PENDING</span>';
    return `
    <tr>
      <td><strong>${esc(a.title)}</strong><div class="muted">${esc(a.description || '')}</div></td>
      <td><span class="badge badge-cyan">${esc(a.course_code)}</span></td>
      <td class="muted">${esc(a.due_date || '—')}</td>
      <td>${a.max_score}</td>
      <td>${statusBadge}</td>
      <td>
        ${a.is_submitted
          ? `<button class="btn btn-ghost btn-sm" onclick='viewSubmission(${JSON.stringify(a)})'>VIEW</button>`
          : `<button class="btn btn-purple btn-sm" onclick='submitAssignment(${JSON.stringify(a)})'>SUBMIT</button>`}
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">✎</span>No assignments in your courses.</div></td></tr>';
}

function viewSubmission(assignment) {
  showModal(assignment.title + ' — Submission', `
    <p class="muted" style="margin-bottom:14px">Submitted on <strong>${esc(assignment.submitted || '')}</strong></p>
    <div class="field">
      <label>Your Submission</label>
      <textarea rows="6" readonly style="background:var(--bg-elevated)">${esc(assignment.content || '')}</textarea>
    </div>
    <div class="alert ${assignment.score != null ? 'alert-success' : ''}" style="margin-bottom:0">
      ${assignment.score != null ? `GRADE: <strong>${assignment.score} / ${assignment.max_score}</strong>` : 'Awaiting grading by your instructor.'}
    </div>
  `);
}

function submitAssignment(assignment) {
  showModal('Submit — ' + assignment.title, `
    <form id="submitForm">
      <div class="field">
        <label>Your Work</label>
        <textarea name="content" rows="8" required placeholder="Paste your solution / write a summary of your submission..."></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">SUBMIT</button>
      </div>
    </form>
  `);
  document.getElementById('submitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/student/assignments/${assignment.id}/submit`, {
        method: 'POST', body: { content: e.target.content.value },
      });
      toast('Assignment submitted');
      closeModal();
      loadAssignments();
    } catch (err) { toast(err.message, true); }
  });
}

async function loadQuizzes() {
  const quizzes = await api('/api/student/quizzes');
  document.getElementById('quizRows').innerHTML = quizzes.length ? quizzes.map(q => `
    <tr>
      <td><strong>${esc(q.title)}</strong></td>
      <td><span class="badge badge-cyan">${esc(q.course_code)}</span></td>
      <td>${q.question_count}</td>
      <td class="muted">${q.time_limit} min</td>
      <td>${q.last_score != null ? `<span class="badge badge-green">${q.last_score}/${q.question_count}</span>` : '<span class="badge badge-yellow">NOT TAKEN</span>'}</td>
      <td><button class="btn btn-purple btn-sm" onclick="startQuiz(${q.id}, '${esc(q.title)}')">TAKE QUIZ</button></td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">◎</span>No quizzes available.</div></td></tr>';
}

async function startQuiz(id, title) {
  try {
    const quiz = await api('/api/student/quizzes/' + id);
    activeQuiz = quiz;
    showModal('Quiz: ' + title, `
      <div class="alert alert-success" style="margin-bottom:16px">
        <strong>${quiz.question_count} questions</strong> · ${quiz.time_limit} min time limit
      </div>
      <div id="quizQuestions"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="button" class="btn btn-purple" onclick="submitQuiz()">SUBMIT QUIZ</button>
      </div>
    `);
    renderQuiz(quiz.questions);
  } catch (err) { toast(err.message, true); }
}

function renderQuiz(questions) {
  const wrap = document.getElementById('quizQuestions');
  wrap.innerHTML = questions.map((q, qi) => `
    <div class="quiz-question">
      <div class="qq-text">${qi + 1}. ${esc(q.text)}</div>
      <div class="qq-options">
        ${q.options.map((opt, oi) => `
          <label class="qq-option" data-q="${q.id}" data-opt="${oi}">
            <input type="radio" name="answer-${q.id}" value="${oi}" style="accent-color:var(--cyan)">
            ${String.fromCharCode(65 + oi)}. ${esc(opt)}
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('.qq-option').forEach(label => {
    label.addEventListener('click', () => {
      const qId = label.dataset.q;
      wrap.querySelectorAll(`.qq-option[data-q="${qId}"]`).forEach(l => l.classList.remove('selected'));
      label.classList.add('selected');
      label.querySelector('input').checked = true;
    });
  });
}

async function submitQuiz() {
  const answers = {};
  document.querySelectorAll('.quiz-question').forEach(qEl => {
    const checked = qEl.querySelector('input:checked');
    if (checked) answers[checked.name.replace('answer-', '')] = Number(checked.value);
  });
  if (Object.keys(answers).length !== activeQuiz.questions.length) {
    return toast('Answer all questions before submitting', true);
  }
  try {
    const result = await api(`/api/student/quizzes/${activeQuiz.id}/submit`, {
      method: 'POST', body: { answers },
    });
    closeModal();
    activeQuiz = null;
    toast(`Score: ${result.score}/${result.total}`);
    loadQuizzes();
    loadDashboard();
  } catch (err) { toast(err.message, true); }
}

async function loadAttendance() {
  const attendance = await api('/api/student/attendance');
  const summary = { present: 0, late: 0, absent: 0 };
  for (const a of attendance) summary[a.status] = (summary[a.status] || 0) + 1;
  const total = attendance.length || 1;

  document.getElementById('attStatGrid').innerHTML = `
    <div class="stat-card green"><div class="stat-num">${summary.present || 0}</div><div class="stat-label">Present</div></div>
    <div class="stat-card purple"><div class="stat-num">${summary.late || 0}</div><div class="stat-label">Late</div></div>
    <div class="stat-card"><div class="stat-num">${summary.absent || 0}</div><div class="stat-label">Absent</div></div>
    <div class="stat-card"><div class="stat-num">${Math.round(((summary.present || 0) / total) * 100)}%</div><div class="stat-label">Attendance Rate</div></div>
  `;

  document.getElementById('attendanceRows').innerHTML = attendance.length ? attendance.map(a => {
    const cls = a.status === 'present' ? 'green' : a.status === 'late' ? 'yellow' : 'red';
    return `
    <tr>
      <td class="muted">${esc(a.date)}</td>
      <td><span class="badge badge-cyan">${esc(a.course_code)}</span> <span class="muted">${esc(a.course_title)}</span></td>
      <td><span class="badge badge-${cls}">${esc(a.status.toUpperCase())}</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="3"><div class="empty-state"><span class="es-icon">✓</span>No attendance records yet.</div></td></tr>';
}

async function loadGrades() {
  const grades = await api('/api/student/grades');

  document.getElementById('gradeRows').innerHTML = grades.assignmentGrades.length ? grades.assignmentGrades.map(g => {
    const pct = Math.round((g.score / g.max_score) * 100);
    return `
    <tr>
      <td><strong>${esc(g.title)}</strong></td>
      <td>${esc(g.course_code)} — <span class="muted">${esc(g.course_title)}</span></td>
      <td>${g.score}</td>
      <td>${g.max_score} <span class="badge badge-${pct >= 70 ? 'green' : pct >= 50 ? 'yellow' : 'red'}" style="margin-left:6px">${pct}%</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="4"><div class="empty-state"><span class="es-icon">▤</span>No graded assignments yet.</div></td></tr>';

  document.getElementById('quizGradeRows').innerHTML = grades.quizGrades.length ? grades.quizGrades.map(g => {
    const pct = Math.round((g.score / g.total) * 100);
    return `
    <tr>
      <td><strong>${esc(g.title)}</strong></td>
      <td>${esc(g.course_code)} — <span class="muted">${esc(g.course_title)}</span></td>
      <td>${g.score}/${g.total} <span class="badge badge-${pct >= 70 ? 'green' : pct >= 50 ? 'yellow' : 'red'}" style="margin-left:6px">${pct}%</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="3"><div class="empty-state"><span class="es-icon">▤</span>No quiz results yet.</div></td></tr>';
}

function showModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalBody').innerHTML = '';
}
