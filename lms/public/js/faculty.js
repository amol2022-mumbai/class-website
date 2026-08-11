let currentUser = null;
let facultyCourses = [];
let gradingAssignmentId = null;

const tabTitles = {
  dashboard: ['// FACULTY / OVERVIEW', 'My Dashboard'],
  courses: ['// FACULTY / COURSES', 'My Courses'],
  syllabus: ['// FACULTY / SYLLABUS', 'Syllabus Progress'],
  lessons: ['// FACULTY / LESSON LOG', 'Lecture Records'],
  timetable: ['// FACULTY / TIMETABLE', 'Weekly Timetable'],
  students: ['// FACULTY / STUDENTS', 'Student Roster'],
  markbook: ['// FACULTY / MARKBOOK', 'Course Gradebook'],
  attendance: ['// FACULTY / ATTENDANCE', 'Attendance Tracker'],
  assignments: ['// FACULTY / GRADING', 'Assignment Grading'],
  leaves: ['// FACULTY / LEAVE', 'Leave Management'],
};

(async function init() {
  currentUser = await requireAuth('faculty');
  if (!currentUser) return;
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userId').textContent = '@' + currentUser.username;

  document.getElementById('sideNav').querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('attDate').value = todayStr();
  document.getElementById('rosterCourse').addEventListener('change', () => loadRoster());
  document.getElementById('attCourse').addEventListener('change', () => loadAttendance());
  document.getElementById('attDate').addEventListener('change', () => loadAttendance());
  document.getElementById('lessonCourse').addEventListener('change', () => fillLessonSyllabus());
  document.getElementById('leaveForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    applyLeave(new FormData(ev.target));
  });
  document.getElementById('lessonForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    logLesson(new FormData(ev.target));
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
  else if (tab === 'syllabus') loadFacultySyllabus();
  else if (tab === 'lessons') loadLessons();
  else if (tab === 'timetable') loadTimetable();
  else if (tab === 'students') loadRoster();
  else if (tab === 'markbook') loadMarkbook();
  else if (tab === 'attendance') loadAttendance();
  else if (tab === 'assignments') loadAssignments();
  else if (tab === 'leaves') loadLeaves();
}

async function loadCourses() {
  facultyCourses = await api('/api/faculty/courses');
  const grid = document.getElementById('courseGrid');
  grid.innerHTML = facultyCourses.length ? facultyCourses.map(c => `
    <div class="course-card">
      <div class="cc-top">
        <span class="course-code">${esc(c.code)}</span>
        <span class="badge badge-purple">${esc(c.level)}</span>
      </div>
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.description || '')}</p>
      <div class="course-meta">
        <span class="badge badge-cyan">${c.student_count} students</span>
        <span class="badge badge-green">${c.batch_name ? esc(c.batch_name) : 'No batch'}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-purple btn-sm" onclick="openFacultyDiscussion(${c.id}, '${esc(c.code)}')">Q&A BOARD</button>
      </div>
    </div>
  `).join('') : '<div class="empty-state"><span class="es-icon">⬡</span>No courses assigned to you yet.</div>';

  const rosterSel = document.getElementById('rosterCourse');
  const attSel = document.getElementById('attCourse');
  const markbookSel = document.getElementById('markbookCourse');
  const lessonSel = document.getElementById('lessonCourse');
  const opts = facultyCourses.map(c =>
    `<option value="${c.id}">${esc(c.code)} — ${esc(c.title)}</option>`
  ).join('');
  rosterSel.innerHTML = '<option value="">Select course...</option>' + opts;
  attSel.innerHTML = '<option value="">Select course...</option>' + opts;
  if (markbookSel) markbookSel.innerHTML = '<option value="">Select course...</option>' + opts;
  if (lessonSel) lessonSel.innerHTML = '<option value="">Select course...</option>' + opts;
}

// Populate the syllabus-topic dropdown for the selected course in the lesson form.
async function fillLessonSyllabus() {
  const courseId = document.getElementById('lessonCourse').value;
  const sySel = document.getElementById('lessonSyllabus');
  if (!courseId) { sySel.innerHTML = '<option value="">No syllabus selected</option>'; return; }
  const rows = await api('/api/faculty/syllabus');
  const items = rows.filter(s => s.course_id === Number(courseId));
  sySel.innerHTML = '<option value="">— no syllabus link —</option>' + items.map(s =>
    `<option value="${s.id}">Week ${s.week_no}: ${esc(s.topic)} (${esc(s.status)})</option>`
  ).join('') + (items.length ? '' : '<option value="">No syllabus published for this course</option>');
}

// ---------- Syllabus ----------
async function loadFacultySyllabus() {
  try {
    const rows = await api('/api/faculty/syllabus');
    const filter = document.getElementById('facultySyllabusFilter');
    const current = Number(filter.value) || 0;
    const courses = [...new Map(rows.map(s => [s.course_id, { id: s.course_id, code: s.course_code, title: s.course_title }])).values()];
    filter.innerHTML = '<option value="">All Courses</option>' + courses.map(c =>
      `<option value="${c.id}">${esc(c.code)} — ${esc(c.title)}</option>`).join('');
    filter.value = current;

    const list = rows.filter(s => !current || s.course_id === current);
    document.getElementById('facultySyllabusRows').innerHTML = list.length ? list.map(s => `
      <tr>
        <td><span class="badge badge-cyan">${esc(s.course_code)}</span><div class="muted">${esc(s.course_title)}</div></td>
        <td><strong>Week ${s.week_no}</strong></td>
        <td><strong>${esc(s.topic)}</strong>${s.objectives ? `<div class="muted">${esc(s.objectives)}</div>` : ''}${s.description ? `<div class="muted">${esc(s.description)}</div>` : ''}</td>
        <td><span class="badge ${s.status === 'completed' ? 'badge-green' : s.status === 'in-progress' ? 'badge-yellow' : 'badge-cyan'}">${esc(s.status)}</span></td>
        <td><button class="btn btn-purple btn-sm" onclick="updateSyllabusStatus(${s.id})">UPDATE PROGRESS</button></td>
      </tr>`).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">▦</span>No syllabus published for your courses yet.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

function updateSyllabusStatus(id) {
  showModal('Update Syllabus Progress', `
    <form id="syllabusStatusForm">
      <div class="field">
        <label>Status</label>
        <select name="status">
          <option value="planned">Planned</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">SAVE</button>
      </div>
    </form>
  `);
  document.getElementById('syllabusStatusForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/faculty/syllabus/' + id, { method: 'PUT', body: { status: e.target.status.value } });
      toast('Syllabus progress updated');
      closeModal();
      loadFacultySyllabus();
    } catch (err) { toast(err.message, true); }
  });
}

// ---------- Lesson Log ----------
async function loadLessons() {
  try {
    if (facultyCourses.length === 0) await loadCourses();
    document.getElementById('lessonDate').value = todayStr();
    fillLessonSyllabus();
    const lessons = await api('/api/faculty/lessons');
    document.getElementById('lessonRows').innerHTML = lessons.length ? lessons.map(l => `
      <tr>
        <td class="muted">${esc(l.lesson_date || '—')}</td>
        <td><span class="badge badge-cyan">${esc(l.course_code)}</span></td>
        <td class="muted">${esc(l.batch_name || '—')}</td>
        <td><strong>${esc(l.topic)}</strong></td>
        <td>${l.syllabus_topic ? `<span class="badge badge-green">${esc(l.syllabus_topic)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="muted">${esc(l.notes || '—')}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="deleteLesson(${l.id})">DELETE</button></td>
      </tr>
    `).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">▤</span>No lectures logged yet.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

async function logLesson(f) {
  const body = {
    course_id: Number(f.get('course_id')),
    syllabus_id: f.get('syllabus_id') ? Number(f.get('syllabus_id')) : null,
    lesson_date: f.get('lesson_date'),
    topic: f.get('topic'),
    notes: f.get('notes'),
  };
  try {
    await api('/api/faculty/lessons', { method: 'POST', body });
    toast('Lecture logged');
    document.getElementById('lessonForm').reset();
    document.getElementById('lessonDate').value = todayStr();
    loadLessons();
  } catch (err) { toast(err.message, true); }
}

async function deleteLesson(id) {
  try {
    await api('/api/faculty/lessons/' + id, { method: 'DELETE' });
    toast('Lesson deleted');
    loadLessons();
  } catch (err) { toast(err.message, true); }
}

async function loadDashboard() {
  const courses = await api('/api/faculty/courses');
  const timetable = await api('/api/faculty/timetable');
  const totalStudents = courses.reduce((s, c) => s + c.student_count, 0);
  const cards = [
    { label: 'Courses', value: courses.length, cls: 'purple' },
    { label: 'Students', value: totalStudents },
    { label: 'Slots/Week', value: timetable.length, cls: 'green' },
    { label: 'Teaching Load', value: courses.reduce((s, c) => s + (c.weeks || 0), 0) + ' wks', cls: 'cyan' },
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
        <span class="badge badge-cyan">${c.student_count} students</span>
      </div>
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.description || '')}</p>
      <div class="course-meta">
        <span class="badge badge-green">${c.batch_name ? esc(c.batch_name) : 'No batch'}</span>
        <span class="badge badge-purple">${esc(c.level)}</span>
      </div>
    </div>
  `).join('') : '<div class="empty-state"><span class="es-icon">⬡</span>No courses assigned yet.</div>';
}

let timetableCache = [];
let timetableView = 'table';

async function loadTimetable() {
  try {
    timetableCache = await api('/api/faculty/timetable');
    renderTimetable();
  } catch (err) { toast(err.message, true); }
}

function setTimetableView(view) {
  timetableView = view;
  document.getElementById('timetableTableView').classList.toggle('btn-purple', view === 'table');
  document.getElementById('timetableTableView').classList.toggle('btn-ghost', view !== 'table');
  document.getElementById('timetableWeekView').classList.toggle('btn-purple', view === 'week');
  document.getElementById('timetableWeekView').classList.toggle('btn-ghost', view !== 'week');
  renderTimetable();
}

function renderTimetable() {
  const tableWrap = document.getElementById('timetableRowsWrap');
  const weekWrap = document.getElementById('timetableWeekWrap');
  if (timetableView === 'week') {
    tableWrap.classList.add('hidden');
    weekWrap.classList.remove('hidden');
    renderWeekGrid();
  } else {
    weekWrap.classList.add('hidden');
    tableWrap.classList.remove('hidden');
    const timetable = timetableCache;
    document.getElementById('timetableRows').innerHTML = timetable.length ? timetable.map(t => `
      <tr>
        <td class="muted">${esc(t.day)}</td>
        <td class="muted">${esc(t.start_time)} — ${esc(t.end_time)}</td>
        <td><strong>${esc(t.subject)}</strong></td>
        <td><span class="badge badge-cyan">${esc(t.batch_name)}</span></td>
        <td>${esc(t.course_code)}</td>
        <td>${t.meeting_link ? `<a class="btn btn-purple btn-sm" href="${esc(t.meeting_link)}" target="_blank" rel="noopener">JOIN</a>` : ''}</td>
      </tr>
    `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">⧉</span>No timetable slots for your courses.</div></td></tr>';
  }
}

function renderWeekGrid() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const wrap = document.getElementById('timetableWeekWrap');
  const byDay = {};
  days.forEach(d => byDay[d] = timetableCache.filter(t => t.day === d));
  const hasAny = timetableCache.length > 0;
  wrap.innerHTML = `
    <table class="timetable-grid">
      <thead><tr>
        <th class="tt-time-col">Time</th>
        ${days.map(d => `<th>${d.slice(0, 3).toUpperCase()}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${!hasAny ? `<tr><td colspan="8"><div class="empty-state"><span class="es-icon">⧉</span>No timetable slots for your courses.</div></td></tr>` : ''}
      </tbody>
    </table>`;
  const body = wrap.querySelector('tbody');
  if (!hasAny) return;
  // Time slots from all days, sorted.
  const slots = [...new Map(timetableCache.map(t => [t.start_time, t.end_time])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [start, end] of slots) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="tt-time-col muted"><strong>${esc(start)}</strong>${start !== end ? `<br><span class="muted">${esc(end)}</span>` : ''}</td>`;
    for (const d of days) {
      const td = document.createElement('td');
      const cell = byDay[d].filter(t => t.start_time === start);
      td.innerHTML = cell.length ? cell.map(t => `
        <div class="tt-cell">
          <div class="tt-subject">${esc(t.subject)}</div>
          <div class="tt-meta">${esc(t.course_code)} · ${esc(t.batch_name)}</div>
          ${t.meeting_link ? `<a class="btn btn-purple btn-xs" href="${esc(t.meeting_link)}" target="_blank" rel="noopener">JOIN</a>` : ''}
        </div>
      `).join('') : '';
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
}

async function loadRoster() {
  const courseId = document.getElementById('rosterCourse').value;
  const rows = document.getElementById('rosterRows');
  if (!courseId) {
    rows.innerHTML = '<tr><td colspan="4"><div class="empty-state"><span class="es-icon">▣</span>Select a course to view its students.</div></td></tr>';
    return;
  }
  const students = await api(`/api/faculty/courses/${courseId}/students`);
  rows.innerHTML = students.length ? students.map(s => `
    <tr>
      <td><span class="badge badge-cyan">${esc(s.username)}</span></td>
      <td><strong>${esc(s.name)}</strong></td>
      <td class="muted">${esc(s.mobile || '—')}</td>
      <td><span class="badge badge-green">${s.attendance_count} records</span></td>
    </tr>
  `).join('') : '<tr><td colspan="4"><div class="empty-state"><span class="es-icon">▣</span>No students enrolled in this course.</div></td></tr>';
}

async function loadMarkbook() {
  const courseId = document.getElementById('markbookCourse').value;
  const wrap = document.getElementById('markbookWrap');
  const summary = document.getElementById('markbookSummary');
  if (!courseId) {
    wrap.innerHTML = '<div class="empty-state"><span class="es-icon">▤</span>Select a course to view its markbook.</div>';
    summary.innerHTML = '';
    return;
  }
  try {
    const d = await api(`/api/faculty/courses/${courseId}/markbook`);
    if (!d.students.length) {
      wrap.innerHTML = '<div class="empty-state"><span class="es-icon">▤</span>No students enrolled in this course.</div>';
      summary.innerHTML = '';
      return;
    }
    summary.innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:4px">
        <div class="stat-card"><div class="stat-num">${d.assignments.length}</div><div class="stat-label">Assignments</div></div>
        <div class="stat-card"><div class="stat-num">${d.exams.length}</div><div class="stat-label">Exams</div></div>
        <div class="stat-card"><div class="stat-num">${d.students.length}</div><div class="stat-label">Students</div></div>
        <div class="stat-card"><div class="stat-num">${classAverage(d.students)}</div><div class="stat-label">Class Avg</div></div>
      </div>`;
    wrap.innerHTML = `
      <table class="markbook-table">
        <thead><tr>
          <th>Student</th>
          ${d.assignments.map(a => `<th title="${esc(a.title)}">${esc(a.title)}<div class="muted">${a.max_score}</div></th>`).join('')}
          ${d.exams.map(e => `<th title="${esc(e.title)}">${esc(e.title)}<div class="muted">${e.max_marks}</div></th>`).join('')}
          <th>Assign %</th><th>Exam %</th><th>Attend %</th><th>GPA</th><th>Grade</th>
        </tr></thead>
        <tbody>
          ${d.students.map(s => `
            <tr>
              <td><strong>${esc(s.name)}</strong><div class="muted">${esc(s.username)}</div></td>
              ${d.assignments.map(a => `<td>${s.assignment_scores[a.id] != null ? s.assignment_scores[a.id] : '<span class="muted">—</span>'}</td>`).join('')}
              ${d.exams.map(e => `<td>${s.exam_scores[e.id] != null ? s.exam_scores[e.id] : '<span class="muted">—</span>'}</td>`).join('')}
              <td>${s.assignment_pct != null ? s.assignment_pct + '%' : '—'}</td>
              <td>${s.exam_pct != null ? s.exam_pct + '%' : '—'}</td>
              <td>${s.attendance_pct != null ? s.attendance_pct + '%' : '—'}</td>
              <td><strong>${s.gpa}</strong></td>
              <td><span class="badge ${gradeBadge(s.grade)}">${esc(s.grade)}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) { toast(err.message, true); }
}

function classAverage(students) {
  const vals = students.map(s => s.overall_pct).filter(v => v != null);
  if (!vals.length) return '—';
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) + '%';
}

function gradeBadge(g) {
  if (g === 'A' || g === 'B') return 'badge-green';
  if (g === 'C') return 'badge-yellow';
  if (g === 'D' || g === 'E') return 'badge-yellow';
  if (g === 'F') return 'badge-red';
  return 'badge-cyan';
}

async function loadAttendance() {
  const courseId = document.getElementById('attCourse').value;
  const date = document.getElementById('attDate').value || todayStr();
  const view = document.getElementById('attendanceView');
  if (!courseId) {
    view.innerHTML = '<div class="empty-state"><span class="es-icon">✓</span>Select a course to mark attendance.</div>';
    return;
  }
  const students = await api(`/api/faculty/courses/${courseId}/students`);
  if (students.length === 0) {
    view.innerHTML = '<div class="empty-state"><span class="es-icon">✓</span>No students enrolled in this course.</div>';
    return;
  }
  view.innerHTML = `
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header">
        <h2>Mark for ${esc(date)}</h2>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-small" onclick="setAllAttendance('present')">ALL P</button>
          <button class="btn btn-ghost btn-small" onclick="setAllAttendance('absent')">ALL A</button>
        </div>
      </div>
      <div class="att-grid">
        ${students.map(s => `
          <div class="att-card" data-student="${s.id}">
            <div class="att-name">${esc(s.name)}</div>
            <div class="att-meta">${esc(s.username)}</div>
            <div class="att-actions">
              <button class="att-btn present" data-status="present">P</button>
              <button class="att-btn late" data-status="late">L</button>
              <button class="att-btn absent" data-status="absent">A</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  view.querySelectorAll('.att-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.att-card');
      const status = btn.dataset.status;
      try {
        await api('/api/faculty/attendance', { method: 'POST', body: {
          student_id: Number(card.dataset.student), course_id: Number(courseId), date, status,
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

function setAllAttendance(status) {
  document.querySelectorAll('#attendanceView .att-card').forEach(card => {
    card.querySelectorAll('.att-btn').forEach(b => {
      b.classList.remove('active-present', 'active-late', 'active-absent');
    });
    card.querySelector(`.att-btn[data-status="${status}"]`).classList.add('active-' + status);
  });
}

async function loadAssignments() {
  const courses = await api('/api/faculty/courses');
  let rows = [];
  for (const c of courses) {
    const assignments = await api(`/api/faculty/courses/${c.id}/assignments`);
    for (const a of assignments) rows.push({ ...a, course_code: c.code, course_title: c.title });
  }
  document.getElementById('assignmentRows').innerHTML = rows.length ? rows.map(a => `
    <tr>
      <td><strong>${esc(a.title)}</strong><div class="muted">${esc(a.description || '')}</div>
        ${a.has_attachment ? `<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="downloadAssignmentFile(${a.id})">DOWNLOAD MATERIAL</button>` : ''}
      </td>
      <td><span class="badge badge-cyan">${esc(a.course_code)}</span></td>
      <td class="muted">${esc(a.due_date || '—')}</td>
      <td><span class="badge badge-purple">${a.max_score} pts</span></td>
      <td><button class="btn btn-purple btn-sm" onclick="showSubmissions(${a.id}, '${esc(a.title)}')">GRADE</button></td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">✎</span>No assignments in your courses.</div></td></tr>';
}

async function downloadAssignmentFile(id) {
  try {
    const a = await api('/api/faculty/assignments/' + id + '/attachment');
    downloadFromB64(a.name, a.data);
  } catch (err) { toast(err.message, true); }
}

async function showSubmissions(id, title) {
  gradingAssignmentId = id;
  const submissions = await api(`/api/faculty/assignments/${id}/submissions`);
  document.getElementById('submissionsTitle').textContent = 'Submissions — ' + title;
  document.getElementById('submissionsPanel').style.display = 'block';
  document.getElementById('submissionRows').innerHTML = submissions.length ? submissions.map(s => `
    <tr>
      <td><strong>${esc(s.student_name)}</strong> <span class="muted">(${esc(s.username)})</span></td>
      <td class="muted">${esc(s.content || '—')}</td>
      <td>${s.has_attachment
        ? `<button class="btn btn-ghost btn-sm" onclick="downloadSubmissionFile(${s.id})">${esc(s.attachment_name || 'FILE')}</button>`
        : '<span class="muted">—</span>'}</td>
      <td class="muted">${esc(s.submitted_at || '')}</td>
      <td>
        <input type="number" id="fs-${s.id}" min="0" max="100" value="${s.score != null ? s.score : ''}"
               placeholder="—" style="width:70px;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:5px">
      </td>
      <td><button class="btn btn-purple btn-sm" onclick="gradeSubmission(${s.id})">GRADE</button></td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">✎</span>No submissions yet.</div></td></tr>';
}

async function downloadSubmissionFile(sid) {
  try {
    const s = await api('/api/faculty/submissions/' + sid + '/attachment');
    downloadFromB64(s.name, s.data);
  } catch (err) { toast(err.message, true); }
}

function closeSubmissions() {
  gradingAssignmentId = null;
  document.getElementById('submissionsPanel').style.display = 'none';
}

async function gradeSubmission(sid) {
  const score = document.getElementById('fs-' + sid).value;
  if (score === '') return toast('Enter a score', true);
  try {
    await api(`/api/faculty/assignments/${gradingAssignmentId}/submissions/${sid}/grade`, {
      method: 'POST', body: { score: Number(score) },
    });
    toast('Grade saved');
    showSubmissions(gradingAssignmentId, document.getElementById('submissionsTitle').textContent.replace('Submissions — ', ''));
  } catch (err) { toast(err.message, true); }
}

// ---------- Leave management ----------
async function loadLeaves() {
  try {
    const leaves = await api('/api/faculty/leaves');
    document.getElementById('leaveRows').innerHTML = leaves.length ? leaves.map(l => `
      <tr>
        <td><span class="badge badge-purple">${esc(l.leave_type)}</span></td>
        <td class="muted">${esc(l.reason || '—')}</td>
        <td class="muted">${esc(l.start_date)}</td>
        <td class="muted">${esc(l.end_date)}</td>
        <td>${l.days}</td>
        <td><span class="badge ${l.status === 'approved' ? 'badge-green' : l.status === 'rejected' ? 'badge-red' : 'badge-yellow'}">${esc(l.status.toUpperCase())}</span></td>
        <td class="muted">${esc(l.reviewed_by || '—')}</td>
      </tr>
    `).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">☍</span>No leave applications yet.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

async function applyLeave(f) {
  const start_date = f.get('start_date');
  const end_date = f.get('end_date');
  if (!start_date || !end_date) return toast('Select both start and end dates', true);
  if (start_date > end_date) return toast('Start date must be before end date', true);
  const body = {
    leave_type: f.get('leave_type'),
    reason: f.get('reason'),
    start_date,
    end_date,
  };
  try {
    await api('/api/faculty/leaves', { method: 'POST', body });
    toast('Leave application submitted for admin approval');
    document.getElementById('leaveForm').reset();
    loadLeaves();
  } catch (err) { toast(err.message, true); }
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

// ---------- Class discussion / Q&A board ----------
let activeDiscussionCourse = null;

function facultyDiscussionCard(p) {
  const isStudent = p.author_role === 'student';
  return `
    <div class="disc-post">
      <div class="disc-head">
        <strong>${esc(p.author_name)}</strong> ${p.author_role === 'faculty' ? '<span class="badge badge-green">FACULTY</span>' : '<span class="badge badge-cyan">STUDENT</span>'}
        <span class="muted">${esc((p.created_at || '').replace('T', ' ').slice(0, 16))}</span>
      </div>
      <div class="disc-body">${esc(p.body)}</div>
      <div class="disc-foot">
        <button class="btn ${p.voted ? 'btn-purple' : 'btn-ghost'} btn-xs" onclick="facultyVoteDiscussion(${p.id})">▲ ${p.upvotes}${p.voted ? ' · Upvoted' : ' Upvote'}</button>
        <button class="btn btn-ghost btn-xs" onclick="facultyReplyTo('${esc(p.author_name)}', ${p.id})">ANSWER</button>
      </div>
      ${(p.replies || []).length ? `<div class="disc-replies">${p.replies.map(r => `
        <div class="disc-post disc-reply">
          <div class="disc-head">
            <strong>${esc(r.author_name)}</strong> ${r.author_role === 'faculty' ? '<span class="badge badge-green">FACULTY</span>' : ''}
            <span class="muted">${esc((r.created_at || '').replace('T', ' ').slice(0, 16))}</span>
          </div>
          <div class="disc-body">${esc(r.body)}</div>
          <div class="disc-foot">
            <button class="btn ${r.voted ? 'btn-purple' : 'btn-ghost'} btn-xs" onclick="facultyVoteDiscussion(${r.id})">▲ ${r.upvotes}${r.voted ? ' · Upvoted' : ' Upvote'}</button>
          </div>
        </div>`).join('')}</div>` : ''}
    </div>`;
}

async function openFacultyDiscussion(courseId, code) {
  activeDiscussionCourse = courseId;
  showModal(code + ' — Q&A Board', `<div id="discussionWrap" style="min-height:120px"><div class="empty-state"><span class="es-icon">◌</span>Loading...</div></div>`);
  await loadFacultyDiscussion();
}

async function loadFacultyDiscussion() {
  try {
    const d = await api('/api/faculty/courses/' + activeDiscussionCourse + '/discussion');
    const wrap = document.getElementById('discussionWrap');
    wrap.innerHTML = `
      <form id="discussionForm" style="margin-bottom:16px">
        <div style="display:flex;gap:8px">
          <input type="text" id="discussionInput" class="input" placeholder="Answer a question, or post an announcement..." required>
          <button type="submit" class="btn btn-purple">POST</button>
        </div>
      </form>
      ${d.posts.length ? d.posts.map(p => facultyDiscussionCard(p)).join('') : '<div class="empty-state"><span class="es-icon">▦</span>No questions yet.</div>'}`;
    document.getElementById('discussionForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = document.getElementById('discussionInput').value.trim();
      if (!body) return;
      const parentId = window._replyTarget;
      window._replyTarget = null;
      try {
        await api('/api/faculty/courses/' + activeDiscussionCourse + '/discussion', { method: 'POST', body: { body, parent_id: parentId } });
        await loadFacultyDiscussion();
      } catch (err) { toast(err.message, true); }
    });
    window._replyTarget = null;
  } catch (err) { toast(err.message, true); }
}

function facultyReplyTo(author, parentId) {
  const input = document.getElementById('discussionInput');
  if (!input) return;
  window._replyTarget = parentId;
  input.value = '@' + author + ' ';
  input.focus();
}

async function facultyVoteDiscussion(id) {
  try {
    await api('/api/faculty/discussion/' + id + '/vote', { method: 'POST' });
    await loadFacultyDiscussion();
  } catch (err) { toast(err.message, true); }
}
