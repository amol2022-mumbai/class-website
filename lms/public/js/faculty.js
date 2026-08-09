let currentUser = null;
let facultyCourses = [];
let gradingAssignmentId = null;

const tabTitles = {
  dashboard: ['// FACULTY / OVERVIEW', 'My Dashboard'],
  courses: ['// FACULTY / COURSES', 'My Courses'],
  timetable: ['// FACULTY / TIMETABLE', 'Weekly Timetable'],
  students: ['// FACULTY / STUDENTS', 'Student Roster'],
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
  document.getElementById('leaveForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    applyLeave(new FormData(ev.target));
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
  else if (tab === 'students') loadRoster();
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
    </div>
  `).join('') : '<div class="empty-state"><span class="es-icon">⬡</span>No courses assigned to you yet.</div>';

  const rosterSel = document.getElementById('rosterCourse');
  const attSel = document.getElementById('attCourse');
  const opts = facultyCourses.map(c =>
    `<option value="${c.id}">${esc(c.code)} — ${esc(c.title)}</option>`
  ).join('');
  rosterSel.innerHTML = '<option value="">Select course...</option>' + opts;
  attSel.innerHTML = '<option value="">Select course...</option>' + opts;
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

async function loadTimetable() {
  const timetable = await api('/api/faculty/timetable');
  document.getElementById('timetableRows').innerHTML = timetable.length ? timetable.map(t => `
    <tr>
      <td class="muted">${esc(t.day)}</td>
      <td class="muted">${esc(t.start_time)} — ${esc(t.end_time)}</td>
      <td><strong>${esc(t.subject)}</strong></td>
      <td><span class="badge badge-cyan">${esc(t.batch_name)}</span></td>
      <td>${esc(t.course_code)}</td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">⧉</span>No timetable slots for your courses.</div></td></tr>';
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
      <td><strong>${esc(a.title)}</strong><div class="muted">${esc(a.description || '')}</div></td>
      <td><span class="badge badge-cyan">${esc(a.course_code)}</span></td>
      <td class="muted">${esc(a.due_date || '—')}</td>
      <td><span class="badge badge-purple">${a.max_score} pts</span></td>
      <td><button class="btn btn-purple btn-sm" onclick="showSubmissions(${a.id}, '${esc(a.title)}')">GRADE</button></td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">✎</span>No assignments in your courses.</div></td></tr>';
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
      <td class="muted">${esc(s.submitted_at || '')}</td>
      <td>
        <input type="number" id="fs-${s.id}" min="0" max="100" value="${s.score != null ? s.score : ''}"
               placeholder="—" style="width:70px;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:5px">
      </td>
      <td><button class="btn btn-purple btn-sm" onclick="gradeSubmission(${s.id})">GRADE</button></td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">✎</span>No submissions yet.</div></td></tr>';
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
