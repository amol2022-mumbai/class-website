let currentUser = null;
let submissionsAssignmentId = null;
let editingQuiz = null;

const tabTitles = {
  dashboard: ['// ADMIN / OVERVIEW', 'Command Center'],
  branches: ['// ADMIN / BRANCHES', 'Branches & Centers'],
  enquiries: ['// ADMIN / ENQUIRIES', 'Enquiry & Lead Funnel'],
  students: ['// ADMIN / STUDENTS', 'Student Records'],
  courses: ['// ADMIN / COURSES', 'Course Catalog'],
  syllabus: ['// ADMIN / SYLLABUS', 'Course Syllabus'],
  enrollments: ['// ADMIN / ENROLLMENTS', 'Enrollment Matrix'],
  batches: ['// ADMIN / BATCHES', 'Batches & Timetable'],
  faculty: ['// ADMIN / FACULTY', 'Faculty Members'],
  staff: ['// ADMIN / STAFF', 'Staff Management'],
  parents: ['// ADMIN / PARENTS', 'Parent Accounts'],
  assignments: ['// ADMIN / ASSIGNMENTS', 'Assignments'],
  quizzes: ['// ADMIN / QUIZZES', 'Quizzes'],
  exams: ['// ADMIN / EXAMS', 'Exams & Results'],
  payments: ['// ADMIN / PAYMENTS', 'Payments & Receipts'],
  fees: ['// ADMIN / FEES', 'Fees & Installments'],
  payroll: ['// ADMIN / PAYROLL', 'Payroll & Staff Attendance'],
  expenses: ['// ADMIN / EXPENSES', 'Expense Tracking'],
  certificates: ['// ADMIN / CERTIFICATES', 'Certificates'],
  notifications: ['// ADMIN / REMINDERS', 'Reminders & Notifications'],
  'auto-remind': ['// ADMIN / AUTO REMINDERS', 'Auto Fee Reminder Scheduler'],
  notices: ['// ADMIN / NOTICES', 'Notices & Announcements'],
  vendors: ['// ADMIN / VENDORS', 'Vendors, Purchases & GST'],
  assets: ['// ADMIN / ASSETS', 'Assets & Inventory'],
  inventory: ['// ADMIN / INVENTORY', 'Inventory & Stock'],
  reportcards: ['// ADMIN / REPORT CARDS', 'Student Report Cards'],
  idcards: ['// ADMIN / ID CARDS', 'Student ID Cards'],
  backup: ['// ADMIN / BACKUP', 'Backup & Restore'],
  attendance: ['// ADMIN / ATTENDANCE', 'Attendance Tracker'],
  reports: ['// ADMIN / REPORTS', 'Report Builder'],
  library: ['// ADMIN / LIBRARY', 'Library Management'],
  transport: ['// ADMIN / TRANSPORT', 'Transport Routes'],
  broadcasts: ['// ADMIN / BROADCASTS', 'Bulk Broadcasts'],
  leaves: ['// ADMIN / LEAVES', 'Leave Management'],
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
    else if (tab === 'enquiries') openEnquiryModal();
    else if (tab === 'courses') openCourseModal();
    else if (tab === 'assignments') openAssignmentModal();
    else if (tab === 'quizzes') openQuizModal();
    else if (tab === 'enrollments') openEnrollmentModal();
    else if (tab === 'batches') openBatchModal();
    else if (tab === 'faculty') openFacultyModal();
    else if (tab === 'staff') openStaffModal();
    else if (tab === 'parents') openParentModal();
    else if (tab === 'exams') openExamModal();
    else if (tab === 'payments') openPaymentModal();
    else if (tab === 'expenses') openExpenseModal();
    else if (tab === 'certificates') openCertificateModal();
    else if (tab === 'branches') openBranchModal();
  });

  await loadBranchSelect();
  switchTab('dashboard');
  document.getElementById('attDate').value = todayStr();
  document.getElementById('staffAttDate').value = todayStr();
  document.getElementById('payrollMonth').value = todayStr().slice(0, 7);
  document.getElementById('gstMonth').value = todayStr().slice(0, 7);
})();

async function loadBranchSelect() {
  try {
    const data = await api('/api/admin/branches');
    window._branches = data.branches || [];
    const sel = document.getElementById('branchSelect');
    sel.innerHTML = (window._branches || []).map(b =>
      `<option value="${b.id}">${esc(b.code)} — ${esc(b.name)}</option>`
    ).join('');
    sel.value = String(data.active || '');
  } catch (_) {}
}

async function switchBranch() {
  const branch_id = Number(document.getElementById('branchSelect').value);
  if (!branch_id) return;
  try {
    await api('/api/admin/branches/switch', { method: 'POST', body: { branch_id } });
    toast('Branch switched');
    const active = document.querySelector('.nav-item.active');
    switchTab(active ? active.dataset.tab : 'dashboard');
  } catch (err) { toast(err.message, true); }
}

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
  else if (tab === 'branches') loadBranches();
  else if (tab === 'enquiries') loadEnquiries();
  else if (tab === 'students') loadStudents();
  else if (tab === 'courses') loadCourses();
  else if (tab === 'syllabus') loadSyllabus();
  else if (tab === 'enrollments') loadEnrollments();
  else if (tab === 'batches') loadBatches();
  else if (tab === 'faculty') loadFaculty();
  else if (tab === 'staff') loadStaff();
  else if (tab === 'parents') loadParents();
  else if (tab === 'assignments') loadAssignments();
  else if (tab === 'quizzes') loadQuizzes();
  else if (tab === 'exams') loadExams();
  else if (tab === 'payments') loadPayments();
  else if (tab === 'fees') loadFeesPlan();
  else if (tab === 'payroll') { loadStaffAttendance(); loadPayslips(); }
  else if (tab === 'expenses') loadExpenses();
  else if (tab === 'certificates') loadCertificates();
  else if (tab === 'notifications') loadNotifications();
  else if (tab === 'auto-remind') { loadReminderStatus(); loadReminderLog(); }
  else if (tab === 'notices') loadNotices();
  else if (tab === 'vendors') { loadVendors(); loadPurchases(); loadGstSummary(); }
  else if (tab === 'assets') loadAssets();
  else if (tab === 'inventory') { loadInventory(); loadInventoryTx(); }
  else if (tab === 'reportcards') { loadCardStudents('rcStudentSelect'); }
  else if (tab === 'idcards') { loadCardStudents('idcStudentSelect'); }
  else if (tab === 'backup') clearBackupHint();
  else if (tab === 'attendance') loadAttendance();
  else if (tab === 'reports') loadReports();
  else if (tab === 'library') { loadBooks(); loadLoans(); }
  else if (tab === 'transport') { loadRoutes(); loadRouteSelect(); }
  else if (tab === 'broadcasts') { loadBroadcasts(); loadBroadcastConfig(); }
  else if (tab === 'leaves') { loadLeaves(); loadLeaveCalendar(); }
}

// ---------- Branches ----------
async function loadBranches() {
  const data = await api('/api/admin/branches');
  window._branches = data.branches || [];
  document.getElementById('branchRows').innerHTML = (data.branches || []).length ? data.branches.map(b => `
    <tr>
      <td><span class="badge badge-cyan">${esc(b.code)}</span> ${b.id === data.active ? '<span class="badge badge-green">ACTIVE</span>' : ''}</td>
      <td><strong>${esc(b.name)}</strong><br><span class="muted">${esc(b.address || '')}</span></td>
      <td class="muted">${esc(b.gstin || '—')}</td>
      <td>${esc(b.gst_rate)}%</td>
      <td>${b.students}</td>
      <td>${b.courses}</td>
      <td>${b.staff}</td>
      <td>${b.expenses}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="openBranchModal(${b.id})">EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBranch(${b.id}, '${esc(b.name)}')">DEL</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="9"><div class="empty-state"><span class="es-icon">◈</span>No branches yet.</div></td></tr>';
}

function openBranchModal(id) {
  const b = (window._branches || []).find(x => x.id === id) || {};
  showModal(b.id ? 'Edit Branch — ' + b.code : 'Add Branch', `
    <form id="branchForm">
      <div class="form-grid">
        <div class="field">
          <label>Branch Name</label>
          <input type="text" name="name" required value="${esc(b.name || '')}" placeholder="e.g. Pune Campus">
        </div>
        <div class="field">
          <label>Branch Code</label>
          <input type="text" name="code" required value="${esc(b.code || '')}" placeholder="e.g. PUN" style="text-transform:uppercase">
        </div>
        <div class="field span-2">
          <label>Address</label>
          <input type="text" name="address" value="${esc(b.address || '')}" placeholder="Street, City - PIN">
        </div>
        <div class="field">
          <label>Phone</label>
          <input type="text" name="phone" value="${esc(b.phone || '')}">
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" value="${esc(b.email || '')}">
        </div>
        <div class="field">
          <label>GSTIN</label>
          <input type="text" name="gstin" value="${esc(b.gstin || '')}" placeholder="e.g. 27ABCDE1234F1Z5">
        </div>
        <div class="field">
          <label>GST Rate (%)</label>
          <input type="number" name="gst_rate" min="0" max="28" step="0.5" value="${b.gst_rate != null ? b.gst_rate : 18}">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${b.id ? 'SAVE CHANGES' : 'ADD BRANCH'}</button>
      </div>
    </form>
  `);
  document.getElementById('branchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      name: f.get('name'), code: f.get('code'), address: f.get('address'),
      phone: f.get('phone'), email: f.get('email'), gstin: f.get('gstin'),
      gst_rate: Number(f.get('gst_rate')),
    };
    try {
      if (b.id) await api('/api/admin/branches/' + b.id, { method: 'PUT', body });
      else await api('/api/admin/branches', { method: 'POST', body });
      toast(b.id ? 'Branch updated' : 'Branch added');
      closeModal();
      loadBranches();
      loadBranchSelect();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteBranch(id, name) {
  if (!confirm(`Delete branch "${name}"? Only empty branches can be deleted.`)) return;
  try {
    await api('/api/admin/branches/' + id, { method: 'DELETE' });
    toast('Branch deleted');
    loadBranches();
    loadBranchSelect();
  } catch (err) { toast(err.message, true); }
}

// ---------- Dashboard ----------
async function loadStats() {
  const s = await api('/api/admin/stats');
  const cards = [
    { label: 'Students', value: s.students },
    { label: 'Open Enquiries', value: s.openEnquiries || 0, cls: 'purple' },
    { label: 'Overdue Fees', value: s.overdueFees || 0, cls: s.overdueFees > 0 ? 'red' : 'green' },
    { label: 'Courses', value: s.courses },
    { label: 'Assignments', value: s.assignments },
    { label: 'Quizzes', value: s.quizzes },
    { label: 'Enrollments', value: s.enrollments, cls: 'purple' },
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

  try {
    const charts = await api('/api/admin/dashboard/charts');
    renderCharts(charts);
  } catch (_) {}
}

function renderCharts(c) {
  const months = c.revenue_by_month || [];
  const max = Math.max(1, ...months.map(m => m.total));
  document.getElementById('revenueBars').innerHTML = months.map(m => `
    <div class="bar-col">
      <div class="bar-val">${fmtMoney(m.total)}</div>
      <div class="bar" style="height:${Math.round((m.total / max) * 100)}%"></div>
      <div class="bar-lbl">${m.month.slice(2)}</div>
    </div>
  `).join('') || '<span class="muted">No revenue data</span>';

  const fs = c.fee_status || {};
  const fsTotal = Math.max(1, (fs.paid || 0) + (fs.pending || 0) + (fs.overdue || 0));
  document.getElementById('feeDonut').innerHTML =
    `<div><span class="legend"><span class="legend-dot" style="background:var(--green)"></span>Cleared <b>${fs.paid || 0}</b></span>
     <span class="legend"><span class="legend-dot" style="background:var(--yellow)"></span>Pending <b>${fs.pending || 0}</b></span>
     <span class="legend"><span class="legend-dot" style="background:var(--red)"></span>Overdue <b>${fs.overdue || 0}</b></span></div>
     <div style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:10px">
       ${barRow('Cleared', (fs.paid || 0) / fsTotal, 'var(--green)')}
       ${barRow('Pending', (fs.pending || 0) / fsTotal, 'var(--yellow)')}
       ${barRow('Overdue', (fs.overdue || 0) / fsTotal, 'var(--red)')}
     </div>`;

  const eq = c.enquiries || [];
  const eqTotal = Math.max(1, eq.reduce((s, e) => s + e.count, 0));
  document.getElementById('enquiryDonut').innerHTML =
    `<div>${eq.map(e => `<span class="legend"><span class="legend-dot" style="background:var(--cyan)"></span>${esc(e.status)} <b>${e.count}</b></span>`).join('')}</div>
     <div style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:10px">
       ${eq.map(e => barRow(esc(e.status), e.count / eqTotal, 'var(--cyan)')).join('')}
     </div>`;

  const tc = c.top_courses || [];
  const tcMax = Math.max(1, ...tc.map(t => t.students));
  document.getElementById('courseDonut').innerHTML =
    `<div style="flex:1">${tc.map(t => `
       <div class="legend"><span class="legend-dot" style="background:var(--purple)"></span>${esc(t.title)} <b>${t.students}</b></div>
      `).join('') || '<span class="muted">No enrollments</span>'}</div>
     <div style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:10px">
       ${tc.map(t => barRow(esc(t.title), t.students / tcMax, 'var(--purple)')).join('')}
     </div>`;

  // Attendance trend (per-day percentage, last 30 days).
  const at = c.attendance_trend || [];
  const atMax = Math.max(1, ...at.map(a => a.pct));
  const elAtt = document.getElementById('attendanceBars');
  if (elAtt) {
    elAtt.innerHTML = at.length
      ? at.map(a => `
        <div class="bar-col">
          <div class="bar-val">${a.pct}%</div>
          <div class="bar" style="height:${Math.round((a.pct / atMax) * 100)}%"></div>
          <div class="bar-lbl">${a.date.slice(5)}</div>
        </div>`).join('')
      : '<span class="muted">No attendance recorded yet</span>';
  }

  // Income vs expense bars.
  const ive = c.income_vs_expense || [];
  const iveMax = Math.max(1, ...ive.flatMap(m => [m.income, m.expense]));
  const elIe = document.getElementById('incomeExpenseDonut');
  if (elIe) {
    elIe.innerHTML = ive.length
      ? ive.map(m => `
        <div class="legend"><span class="legend-dot" style="background:var(--green)"></span>${m.month} Income <b>${fmtMoney(m.income)}</b>
          <span style="margin-left:8px"><span class="legend-dot" style="background:var(--red)"></span>Expense <b>${fmtMoney(m.expense)}</b></span></div>
        <div style="width:100%">
          ${barRow('Income', m.income / iveMax, 'var(--green)')}
          ${barRow('Expense', m.expense / iveMax, 'var(--red)')}
        </div>`).join('')
      : '<span class="muted">No income/expense data</span>';
  }

  // Academic performance: pass rate + assignment completion.
  const elAc = document.getElementById('academicDonut');
  if (elAc) {
    elAc.innerHTML = `
      <div class="legend"><span class="legend-dot" style="background:var(--cyan)"></span>Exam pass rate <b>${c.pass_rate || 0}%</b></div>
      <div style="width:100%">${barRow('Exam pass rate', (c.pass_rate || 0) / 100, 'var(--cyan)')}</div>
      <div class="legend" style="margin-top:10px"><span class="legend-dot" style="background:var(--yellow)"></span>Assignments submitted <b>${c.assignment_submissions || 0}</b></div>`;
  }
}

function barRow(label, pct, color) {
  return `<div style="font-size:11px;color:var(--text-muted)">${label}
    <div style="height:10px;background:#0a0e22;border-radius:5px;overflow:hidden;margin-top:3px">
      <div style="height:100%;width:${Math.round(pct * 100)}%;background:${color};border-radius:5px"></div>
    </div></div>`;
}

// ---------- Students ----------
async function loadStudents() {
  const students = await api('/api/admin/students');
  window._students = students;
  document.getElementById('studentRows').innerHTML = students.length ? students.map(s => `
    <tr>
      <td><span class="badge badge-cyan">${esc(s.username)}</span></td>
      <td><strong>${esc(s.name)}</strong></td>
      <td class="muted">${esc(s.email || '—')}</td>
      <td class="muted">${esc(s.mobile || '—')}</td>
      <td>${fmtMoney(s.fee_amount)} ${s.fee_installments > 1 ? `<span class="badge badge-purple">×${s.fee_installments}</span>` : ''}</td>
      <td>${s.discount_amount > 0 ? `<span class="badge badge-cyan" title="${esc(s.discount_type === 'percent' ? s.discount_value + '%' : 'Rs.' + s.discount_value)}">−${fmtMoney(s.discount_amount)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${s.pending > 0 ? `<strong style="color:var(--red)">${fmtMoney(s.pending)}</strong>` : '<span class="badge badge-green">CLEARED</span>'}</td>
      <td>${s.course_count}</td>
      <td>${s.present_days}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="viewStudentPlan(${s.id})">PLAN</button>
        <button class="btn btn-ghost btn-sm" onclick='openStudentModal(${JSON.stringify(s)})'>EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteStudent(${s.id}, '${esc(s.name)}')">DELETE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="10"><div class="empty-state"><span class="es-icon">▣</span>No students registered yet.</div></td></tr>';
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
        <div class="field">
          <label>Fee Amount (Rs.)</label>
          <input type="number" name="fee_amount" min="0" step="0.01" value="${student ? student.fee_amount || 0 : 0}">
        </div>
        <div class="field">
          <label>Concession / Discount</label>
          <select name="discount_type">
            <option value="none" ${student && student.discount_type === 'none' ? 'selected' : ''}>None</option>
            <option value="percent" ${student && student.discount_type === 'percent' ? 'selected' : ''}>Percentage (%)</option>
            <option value="fixed" ${student && student.discount_type === 'fixed' ? 'selected' : ''}>Fixed (Rs.)</option>
          </select>
        </div>
        <div class="field">
          <label>Concession Value</label>
          <input type="number" name="discount_value" min="0" step="0.01" value="${student && student.discount_value ? student.discount_value : 0}" placeholder="e.g. 10">
        </div>
        <div class="field">
          <label>Installments</label>
          <input type="number" name="fee_installments" min="1" max="12" value="${student && student.fee_installments > 1 ? student.fee_installments : 1}">
          <small class="muted">>1 generates a due-date schedule</small>
        </div>
        <div class="field">
          <label>Fee Start Date (installments)</label>
          <input type="date" name="fee_start_date" value="${esc(student && student.fee_start_date ? student.fee_start_date : '')}">
        </div>
        <div class="field">
          <label>Fee Paid</label>
          <select name="fee_paid">
            <option value="1" ${student && student.fee_paid ? 'selected' : ''}>Yes — paid</option>
            <option value="0" ${!student || !student.fee_paid ? 'selected' : ''}>No — pending</option>
          </select>
        </div>
        <div class="field span-2">
          <label>Student Photo (shows on ID card)</label>
          <div style="display:flex;gap:12px;align-items:center">
            <div id="photoPreview" class="photo-preview">${esc((student && student.name || ' ')[0] || ' ')}</div>
            <div style="flex:1">
              <input type="file" id="studentPhotoInput" accept="image/*">
              <small class="muted">JPG/PNG up to ~2MB.</small>
              ${student && student.has_photo ? '<div style="margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" id="removePhotoBtn">REMOVE PHOTO</button></div>' : ''}
            </div>
          </div>
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
    const payload = {
      name: f.get('name'), email: f.get('email'), mobile: f.get('mobile'),
      fee_amount: Number(f.get('fee_amount')) || 0, fee_paid: Number(f.get('fee_paid')) === 1,
      discount_type: f.get('discount_type'), discount_value: Number(f.get('discount_value')) || 0,
      fee_installments: Number(f.get('fee_installments')) || 1,
      fee_start_date: f.get('fee_start_date') || undefined,
    };
    const photoInput = document.getElementById('studentPhotoInput');
    try {
      await fileToBase64(photoInput && photoInput.files[0], async (photo) => {
        if (photo) { payload.photo_data = photo.data; payload.photo_name = photo.name; }
        if (isEdit) {
          if (window._removePhoto) payload.remove_photo = true;
          if (f.get('password')) payload.password = f.get('password');
          await api('/api/admin/students/' + student.id, { method: 'PUT', body: payload });
        } else {
          await api('/api/admin/students', { method: 'POST', body: {
            username: f.get('username'), password: f.get('password'),
            ...payload,
          }});
        }
        toast(isEdit ? 'Student updated' : 'Student created');
        closeModal();
        loadStudents();
      });
    } catch (err) { toast(err.message, true); }
  });

  const photoInput = document.getElementById('studentPhotoInput');
  if (photoInput) {
    photoInput.addEventListener('change', () => {
      const file = photoInput.files[0];
      if (!file) return;
      fileToBase64(file, (photo) => {
        const preview = document.getElementById('photoPreview');
        if (photo && preview) preview.innerHTML = `<img src="data:${file.type};base64,${photo.data}" alt="">`;
      });
    });
  }
  const removeBtn = document.getElementById('removePhotoBtn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      window._removePhoto = true;
      document.getElementById('photoPreview').innerHTML = esc((student && student.name || ' ')[0] || ' ');
      document.getElementById('studentPhotoInput').value = '';
      removeBtn.remove();
    });
  }
}

async function deleteStudent(id, name) {
  if (!confirm(`Delete student "${name}"? This removes all their data.`)) return;
  try {
    await api('/api/admin/students/' + id, { method: 'DELETE' });
    toast('Student deleted');
    loadStudents();
  } catch (err) { toast(err.message, true); }
}

// ---------- Enquiries / Leads ----------
async function loadEnquiries() {
  const [enquiries, courses] = await Promise.all([api('/api/admin/enquiries'), api('/api/admin/courses')]);
  window._enquiries = enquiries;
  window._enqCourses = courses;
  const statusBadge = { new: 'badge-yellow', contacted: 'badge-cyan', 'follow-up': 'badge-purple', enrolled: 'badge-green', lost: 'badge-red' };
  const today = todayStr();
  document.getElementById('enquiryRows').innerHTML = enquiries.length ? enquiries.map(en => `
    <tr>
      <td><strong>${esc(en.name)}</strong></td>
      <td class="muted">${esc(en.phone || '—')}<br>${esc(en.email || '')}</td>
      <td class="muted">${en.course_id ? `${esc(en.course_code)} — ${esc(en.course_title)}` : '—'}</td>
      <td class="muted">${esc(en.source || '—')}</td>
      <td><span class="badge ${statusBadge[en.status] || 'badge-yellow'}">${esc(en.status)}</span></td>
      <td class="muted">${en.followup_date ? `${esc(en.followup_date)}${en.followup_date <= today && en.status !== 'enrolled' && en.status !== 'lost' ? ' <span class="badge badge-red">TODAY</span>' : ''}` : '—'}</td>
      <td class="muted">${esc((en.created_at || '').slice(0, 10))}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEnquiryModal(${en.id})">EDIT</button>
        ${en.status !== 'enrolled' ? `<button class="btn btn-purple btn-sm" onclick="convertEnquiry(${en.id}, '${esc(en.name)}')">CONVERT</button>` : ''}
        <select class="btn btn-sm enq-status" style="padding:4px 6px;max-width:120px" onchange="setEnquiryStatus(${en.id}, this.value)">
          <option value="new" ${en.status === 'new' ? 'selected' : ''}>New</option>
          <option value="contacted" ${en.status === 'contacted' ? 'selected' : ''}>Contacted</option>
          <option value="follow-up" ${en.status === 'follow-up' ? 'selected' : ''}>Follow-up</option>
          <option value="enrolled" ${en.status === 'enrolled' ? 'selected' : ''}>Enrolled</option>
          <option value="lost" ${en.status === 'lost' ? 'selected' : ''}>Lost</option>
        </select>
        <button class="btn btn-danger btn-sm" onclick="deleteEnquiry(${en.id}, '${esc(en.name)}')">DEL</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="8"><div class="empty-state"><span class="es-icon">⚑</span>No enquiries yet. Capture leads here.</div></td></tr>';
}

function openEnquiryModal(id) {
  const en = (window._enquiries || []).find(x => x.id === id) || {};
  showModal(en.id ? 'Edit Enquiry' : 'Add Enquiry', `
    <form id="enquiryForm">
      <div class="form-grid">
        <div class="field">
          <label>Full Name</label>
          <input type="text" name="name" required value="${esc(en.name || '')}" placeholder="e.g. Rohan Kulkarni">
        </div>
        <div class="field">
          <label>Phone</label>
          <input type="tel" name="phone" value="${esc(en.phone || '')}" placeholder="e.g. +91 98xxxx">
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" value="${esc(en.email || '')}" placeholder="lead@example.com">
        </div>
        <div class="field">
          <label>Course of Interest</label>
          <select name="course_id">
            <option value="">— Not selected —</option>
            ${(window._enqCourses || []).map(c => `<option value="${c.id}" ${en.course_id == c.id ? 'selected' : ''}>${esc(c.code)} — ${esc(c.title)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Source</label>
          <select name="source">
            ${['Walk-in', 'Website', 'Referral', 'Social Media', 'Phone Call', 'Ads', 'Other'].map(x => `<option value="${x}" ${en.source === x ? 'selected' : ''}>${x}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Status</label>
          <select name="status">
            ${['new', 'contacted', 'follow-up', 'enrolled', 'lost'].map(x => `<option value="${x}" ${en.status === x ? 'selected' : ''}>${x}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Follow-up Date</label>
          <input type="date" name="followup_date" value="${esc(en.followup_date || '')}">
        </div>
        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" rows="2" placeholder="Interests, questions, batch preference...">${esc(en.notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${en.id ? 'SAVE CHANGES' : 'ADD ENQUIRY'}</button>
      </div>
    </form>
  `);
  document.getElementById('enquiryForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const body = {
      name: f.get('name'), phone: f.get('phone'), email: f.get('email'),
      course_id: f.get('course_id') ? Number(f.get('course_id')) : null,
      source: f.get('source'), status: f.get('status'),
      notes: f.get('notes'), followup_date: f.get('followup_date') || undefined,
    };
    try {
      if (en.id) await api('/api/admin/enquiries/' + en.id, { method: 'PUT', body });
      else await api('/api/admin/enquiries', { method: 'POST', body });
      toast(en.id ? 'Enquiry updated' : 'Enquiry added');
      closeModal();
      loadEnquiries();
    } catch (err) { toast(err.message, true); }
  });
}

async function setEnquiryStatus(id, status) {
  try {
    await api('/api/admin/enquiries/' + id, { method: 'PUT', body: { status } });
    toast('Status → ' + status);
    loadEnquiries();
  } catch (err) { toast(err.message, true); }
}

async function deleteEnquiry(id, name) {
  if (!confirm(`Delete enquiry for "${name}"?`)) return;
  try {
    await api('/api/admin/enquiries/' + id, { method: 'DELETE' });
    toast('Enquiry deleted');
    loadEnquiries();
  } catch (err) { toast(err.message, true); }
}

// ---------- Fees & Installments ----------
async function loadFeesPlan() {
  const students = await api('/api/admin/students');
  document.getElementById('feesPlanRows').innerHTML = students.length ? students.map(s => `
    <tr>
      <td><strong>${esc(s.name)}</strong> <span class="muted">(${esc(s.username)})</span></td>
      <td>${fmtMoney(s.fee_amount)}</td>
      <td>${s.discount_amount > 0 ? fmtMoney(s.discount_amount) : '<span class="muted">—</span>'}</td>
      <td>${fmtMoney(s.effective_fee)}</td>
      <td>${fmtMoney(s.paid || 0)}</td>
      <td>${s.pending > 0 ? `<strong style="color:var(--red)">${fmtMoney(s.pending)}</strong>` : '<span class="badge badge-green">0</span>'}</td>
      <td>${s.fee_installments > 1 ? `<span class="badge badge-purple">${s.fee_installments} × ${fmtMoney(s.effective_fee / s.fee_installments)}</span>` : '<span class="muted">Lump sum</span>'}</td>
      <td><span class="badge ${s.pending > 0 ? 'badge-red' : 'badge-green'}">${s.pending > 0 ? 'DUE' : 'PAID'}</span></td>
      <td class="table-actions"><button class="btn btn-ghost btn-sm" onclick="viewStudentPlan(${s.id})">VIEW PLAN</button></td>
    </tr>
  `).join('') : '<tr><td colspan="9"><div class="empty-state"><span class="es-icon">≋</span>No students yet.</div></td></tr>';
}

async function viewStudentPlan(id) {
  const d = await api(`/api/admin/students/${id}/plan`);
  const statusBadge = { paid: 'badge-green', overdue: 'badge-red', pending: 'badge-yellow' };
  const planRows = (d.installments && d.installments.length)
    ? d.installments.map(i => `
      <tr>
        <td>${esc(i.label)}</td>
        <td>${esc(i.due_date || '—')}</td>
        <td>${fmtMoney(i.amount)}</td>
        <td>${fmtMoney(i.paid_amount)}</td>
        <td>${fmtMoney(i.outstanding)}</td>
        <td><span class="badge ${statusBadge[i.status] || 'badge-yellow'}">${esc(i.status)}</span></td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="muted">No installment plan — fee paid as a single amount.</td></tr>`;
  showModal('Fee Plan — ' + d.student_id, `
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-card purple"><div class="stat-num">${fmtMoney(d.effective_fee)}</div><div class="stat-label">Net Fee</div></div>
      <div class="stat-card green"><div class="stat-num">${fmtMoney(d.total_paid)}</div><div class="stat-label">Paid</div></div>
      <div class="stat-card ${d.pending > 0 ? 'red' : 'green'}"><div class="stat-num">${fmtMoney(d.pending)}</div><div class="stat-label">Pending</div></div>
      ${d.overdue_count ? `<div class="stat-card red"><div class="stat-num">${d.overdue_count}</div><div class="stat-label">Overdue</div></div>` : ''}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Label</th><th>Due Date</th><th>Amount</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead>
        <tbody>${planRows}</tbody>
      </table>
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal()">CLOSE</button>
      <button class="btn btn-purple" onclick="openPaymentModal()">RECORD PAYMENT</button>
    </div>
  `);
  window._payForStudent = id;
}

// ---------- Payroll & Staff Attendance ----------
async function loadStaffAttendance() {
  const date = document.getElementById('staffAttDate').value || todayStr();
  const d = await api('/api/admin/staff/attendance?date=' + date);
  const opts = ['present', 'half-day', 'absent', 'leave'];
  document.getElementById('staffAttendanceView').innerHTML = d.staff.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Staff</th><th>Role</th><th>Status (${esc(d.date)})</th></tr></thead>
        <tbody>${d.staff.map(s => `
          <tr>
            <td><strong>${esc(s.name)}</strong></td>
            <td class="muted">${esc(s.role || '—')}</td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${opts.map(o => `
                  <button class="btn btn-sm att-btn ${s.att_status === o ? 'active-' + (o === 'present' ? 'present' : o === 'half-day' ? 'late' : o === 'absent' ? 'absent' : 'late') : ''}"
                          onclick="markStaffAttendance(${s.id}, '${esc(d.date)}', '${o}')">${o.toUpperCase()}</button>`).join('')}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '<div class="empty-state"><span class="es-icon">☰</span>No active staff in this branch.</div>';
}

async function markStaffAttendance(staffId, date, status) {
  try {
    await api('/api/admin/staff/attendance', { method: 'POST', body: { staff_id: staffId, date, status } });
    toast(status + ' saved');
    loadStaffAttendance();
  } catch (err) { toast(err.message, true); }
}

async function loadPayslips() {
  const month = document.getElementById('payrollMonth').value || todayStr().slice(0, 7);
  const d = await api('/api/admin/payroll?month=' + month);
  document.getElementById('payslipRows').innerHTML = d.slips.length ? d.slips.map(p => `
    <tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td class="muted">${esc(p.role || '—')}</td>
      <td class="muted">${esc(p.salary_type)}</td>
      <td>${p.working_days}</td>
      <td>${p.present_days}</td>
      <td>${p.absences}</td>
      <td>${fmtMoney(p.monthly_salary)}</td>
      <td><strong>${fmtMoney(p.net_pay)}</strong></td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="viewPayslip(${p.id})">PAYSLIP</button>
        <button class="btn btn-danger btn-sm" onclick="deletePayslip(${p.id}, '${esc(p.name)}')">DEL</button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="9"><div class="empty-state"><span class="es-icon">☰</span>No payslips for ${esc(month)}. Mark attendance then GENERATE.</div></td></tr>`;
}

async function generatePayroll() {
  const month = document.getElementById('payrollMonth').value || todayStr().slice(0, 7);
  try {
    const res = await api('/api/admin/payroll/generate', { method: 'POST', body: { month } });
    toast(`Generated ${res.slips.length} payslip(s) for ${month}`);
    loadPayslips();
  } catch (err) { toast(err.message, true); }
}

async function viewPayslip(id) {
  const p = await api('/api/admin/payroll/' + id);
  const nameParts = (p.name || 'Staff Member').split(' ');
  showModal('Payslip — ' + p.name, `
    <div class="print-sheet">
      <div class="sheet-head">
        <div class="sheet-brand">VUMCA <span class="sheet-accent">hITECH</span> Computing</div>
        <div class="sheet-org">School of Computer Science &amp; Technology</div>
        <div class="sheet-addr">Plot 14, Sector 7, New Mumbai &ndash; 400 710</div>
        <div class="sheet-rule"></div>
        <div class="sheet-doctitle">SALARY SLIP — ${esc(p.month)}</div>
      </div>
      <table class="sheet-table">
        <tr><th>Employee</th><td><strong>${esc(p.name)}</strong> (${esc(p.role || '—')})</td></tr>
        <tr><th>Working Days</th><td>${p.working_days}</td></tr>
        <tr><th>Days Present</th><td>${p.present_days} ${p.half_days ? `(incl. ${p.half_days} half-day)` : ''}</td></tr>
        <tr><th>Absences</th><td>${p.absences}</td></tr>
        <tr><th>Monthly Salary</th><td>${fmtMoney(p.monthly_salary)}</td></tr>
        <tr><th>Gross Pay</th><td class="sheet-amount">${fmtMoney(p.gross_pay)}</td></tr>
        <tr><th>Net Pay (Amount In Words)</th><td>${esc(toIndianWords(p.gross_pay))}</td></tr>
      </table>
      <div class="sheet-foot">
        <div class="sheet-sign">Authorized Signatory</div>
        <div class="sheet-note">This is a computer generated payslip.<br>Paid by VUMCA hITECH Computing.</div>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal()">CLOSE</button>
      <button class="btn btn-purple" onclick="window.print()">PRINT</button>
    </div>
  `);
}

async function deletePayslip(id, name) {
  if (!confirm(`Delete payslip for ${name}?`)) return;
  try {
    await api('/api/admin/payroll/' + id, { method: 'DELETE' });
    toast('Payslip deleted');
    loadPayslips();
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

// ---------- Syllabus ----------
let syllabusCache = [];

async function loadSyllabus() {
  try {
    syllabusCache = await api('/api/admin/syllabus');
    const filter = Number(document.getElementById('syllabusCourseFilter').value) || 0;
    const courses = window._courses || await api('/api/admin/courses');
    window._courses = courses;
    const filterSel = document.getElementById('syllabusCourseFilter');
    const current = Number(filterSel.value) || 0;
    filterSel.innerHTML = '<option value="">All Courses</option>' + courses.map(c =>
      `<option value="${c.id}">${esc(c.code)} — ${esc(c.title)}</option>`).join('');
    filterSel.value = current;

    const rows = syllabusCache.filter(s => !filter || s.course_id === filter);
    document.getElementById('syllabusRows').innerHTML = rows.length ? rows.map(s => `
      <tr>
        <td><span class="badge badge-cyan">${esc(s.course_code)}</span><div class="muted">${esc(s.course_title)}</div></td>
        <td><strong>Week ${s.week_no}</strong></td>
        <td><strong>${esc(s.topic)}</strong><div class="muted">${esc(s.objectives || '')}</div><div class="muted">${esc(s.description || '')}</div></td>
        <td><span class="badge ${s.status === 'completed' ? 'badge-green' : s.status === 'in-progress' ? 'badge-yellow' : 'badge-cyan'}">${esc(s.status)}</span></td>
        <td class="table-actions">
          <button class="btn btn-ghost btn-sm" onclick="openSyllabusModal(${s.id})">EDIT</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSyllabus(${s.id}, '${esc(s.topic)}')">DEL</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">▦</span>No syllabus entries yet.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

function openSyllabusModal(id) {
  const s = syllabusCache.find(x => x.id === id) || {};
  const courses = window._courses || [];
  showModal(s.id ? 'Edit Syllabus — Week ' + s.week_no : 'Add Syllabus Week', `
    <form id="syllabusForm">
      <div class="form-grid">
        <div class="field">
          <label>Course</label>
          <select name="course_id" ${s.id ? 'disabled' : 'required'}>
            ${courses.map(c => `<option value="${c.id}" ${s.course_id === c.id ? 'selected' : ''}>${esc(c.code)} — ${esc(c.title)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Week No</label>
          <input type="number" name="week_no" min="1" required value="${s.week_no || 1}">
        </div>
        <div class="field span-2">
          <label>Topic</label>
          <input type="text" name="topic" required value="${esc(s.topic || '')}" placeholder="e.g. Functions & Recursion">
        </div>
        <div class="field span-2">
          <label>Objectives</label>
          <input type="text" name="objectives" value="${esc(s.objectives || '')}" placeholder="e.g. Understand function scope, write recursive functions">
        </div>
        <div class="field span-2">
          <label>Description</label>
          <textarea name="description" rows="2" placeholder="Detailed notes / reading material">${esc(s.description || '')}</textarea>
        </div>
        <div class="field span-2">
          <label>Status</label>
          <select name="status">
            <option value="planned" ${s.status === 'planned' ? 'selected' : ''}>Planned</option>
            <option value="in-progress" ${s.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${s.status === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${s.id ? 'SAVE CHANGES' : 'ADD WEEK'}</button>
      </div>
    </form>`);
  document.getElementById('syllabusForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      course_id: s.id ? s.course_id : Number(f.get('course_id')),
      week_no: Number(f.get('week_no')) || 1,
      topic: f.get('topic'), description: f.get('description'),
      objectives: f.get('objectives'), status: f.get('status'),
    };
    try {
      if (s.id) await api('/api/admin/syllabus/' + s.id, { method: 'PUT', body });
      else await api('/api/admin/syllabus', { method: 'POST', body });
      toast(s.id ? 'Syllabus updated' : 'Syllabus week added');
      closeModal();
      loadSyllabus();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteSyllabus(id, topic) {
  if (!confirm(`Delete syllabus entry "${topic}"?`)) return;
  try {
    await api('/api/admin/syllabus/' + id, { method: 'DELETE' });
    toast('Syllabus entry deleted');
    loadSyllabus();
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

// ---------- Batches & Timetable ----------
let activeBatchId = null;

async function loadBatches() {
  const [batches, courses] = await Promise.all([api('/api/admin/batches'), api('/api/admin/courses')]);
  window._courses = courses;
  window._batches = batches;
  document.getElementById('batchRows').innerHTML = batches.length ? batches.map(b => `
    <tr>
      <td><strong>${esc(b.name)}</strong></td>
      <td><span class="badge badge-cyan">${esc(b.course_code)}</span> <span class="muted">${esc(b.course_title)}</span></td>
      <td class="muted">${esc(b.start_date || '—')} → ${esc(b.end_date || '—')}</td>
      <td>${b.capacity}</td>
      <td><span class="badge badge-purple">${b.student_count}</span></td>
      <td>${b.slot_count}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="showBatchDetail(${b.id})">MANAGE</button>
        <button class="btn btn-ghost btn-sm" onclick='openBatchModal(${JSON.stringify(b)})'>EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBatch(${b.id}, '${esc(b.name)}')">DELETE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">⧉</span>No batches yet. Create batches to assign students and timetables.</div></td></tr>';
}

function openBatchModal(batch) {
  const isEdit = !!batch;
  showModal(isEdit ? 'Edit Batch' : 'Add Batch', `
    <form id="batchForm">
      <div class="form-grid">
        <div class="field">
          <label>Name</label>
          <input type="text" name="name" required value="${esc(batch ? batch.name : '')}" placeholder="e.g. CS101 - Batch A">
        </div>
        <div class="field">
          <label>Course</label>
          <select name="course_id" required ${isEdit ? 'disabled' : ''}>
            ${(window._courses || []).map(c => `<option value="${c.id}" ${batch && batch.course_id === c.id ? 'selected' : ''}>${esc(c.code)} — ${esc(c.title)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Start Date</label>
          <input type="date" name="start_date" value="${esc(batch ? batch.start_date || '' : '')}">
        </div>
        <div class="field">
          <label>End Date</label>
          <input type="date" name="end_date" value="${esc(batch ? batch.end_date || '' : '')}">
        </div>
        <div class="field">
          <label>Capacity</label>
          <input type="number" name="capacity" min="0" value="${batch ? batch.capacity : 30}">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${isEdit ? 'SAVE CHANGES' : 'CREATE BATCH'}</button>
      </div>
    </form>
  `);
  document.getElementById('batchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const payload = {
      name: f.get('name'), start_date: f.get('start_date') || null,
      end_date: f.get('end_date') || null, capacity: Number(f.get('capacity')) || 0,
    };
    try {
      if (isEdit) {
        await api('/api/admin/batches/' + batch.id, { method: 'PUT', body: payload });
      } else {
        await api('/api/admin/batches', { method: 'POST', body: { ...payload, course_id: Number(f.get('course_id')) } });
      }
      toast(isEdit ? 'Batch updated' : 'Batch created');
      closeModal();
      loadBatches();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteBatch(id, name) {
  if (!confirm(`Delete batch "${name}"? Students will be unassigned from it.`)) return;
  try {
    await api('/api/admin/batches/' + id, { method: 'DELETE' });
    toast('Batch deleted');
    loadBatches();
  } catch (err) { toast(err.message, true); }
}

async function showBatchDetail(id) {
  activeBatchId = id;
  const d = await api('/api/admin/batches/' + id);
  document.getElementById('batchDetailTitle').textContent = 'Batch — ' + d.batch.name;
  document.getElementById('batchDetailPanel').style.display = 'block';
  renderBatchDetail(d);
}

function closeBatchDetail() {
  activeBatchId = null;
  document.getElementById('batchDetailPanel').style.display = 'none';
}

function renderBatchDetail(d) {
  const b = d.batch;
  document.getElementById('timetableRows').innerHTML = d.timetable.length ? d.timetable.map(t => `
    <tr>
      <td class="muted">${esc(t.day)}</td>
      <td class="muted">${esc(t.start_time)} — ${esc(t.end_time)}</td>
      <td><strong>${esc(t.subject)}</strong></td>
      <td class="muted">${esc(t.instructor || '—')}</td>
      <td>${t.meeting_link ? `<a class="btn btn-purple btn-xs" href="${esc(t.meeting_link)}" target="_blank" rel="noopener">JOIN</a>` : '—'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteTimetableSlot(${t.id})">DEL</button></td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">⧉</span>No slots. Add a slot below.</div></td></tr>';

  document.getElementById('batchStudentRows').innerHTML = d.students.length ? d.students.map(s => `
    <tr>
      <td><strong>${esc(s.name)}</strong> <span class="muted">(${esc(s.username)})</span></td>
      <td class="muted">${esc(s.mobile || '—')}</td>
      <td><button class="btn btn-danger btn-sm" onclick="removeFromBatch(${s.id})">REMOVE</button></td>
    </tr>
  `).join('') : '<tr><td colspan="3"><div class="empty-state"><span class="es-icon">▣</span>No students in this batch.</div></td></tr>';

  document.getElementById('availableStudentRows').innerHTML = d.availableStudents.length ? d.availableStudents.map(s => `
    <tr>
      <td><strong>${esc(s.name)}</strong> <span class="muted">(${esc(s.username)})</span></td>
      <td><button class="btn btn-purple btn-sm" onclick="addToBatch(${s.id})">+ ADD</button></td>
    </tr>
  `).join('') : '<tr><td colspan="2"><div class="empty-state"><span class="es-icon">▣</span>No more students available for this batch.</div></td></tr>';

  document.querySelector('#batchDetailPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function addToBatch(sid) {
  try {
    await api(`/api/admin/batches/${activeBatchId}/students`, { method: 'POST', body: { student_id: sid } });
    toast('Student added to batch');
    showBatchDetail(activeBatchId);
    loadBatches();
  } catch (err) { toast(err.message, true); }
}

async function removeFromBatch(sid) {
  try {
    await api(`/api/admin/batches/${activeBatchId}/students/${sid}`, { method: 'DELETE' });
    toast('Student removed from batch');
    showBatchDetail(activeBatchId);
    loadBatches();
  } catch (err) { toast(err.message, true); }
}

function openTimetableModal() {
  showModal('Add Timetable Slot', `
    <form id="timetableForm">
      <div class="form-grid">
        <div class="field">
          <label>Day</label>
          <select name="day" required>
            ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
              .map(d => `<option>${d}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Subject</label>
          <input type="text" name="subject" required placeholder="e.g. Programming Lab">
        </div>
        <div class="field">
          <label>Start Time</label>
          <input type="time" name="start_time" required value="09:00">
        </div>
        <div class="field">
          <label>End Time</label>
          <input type="time" name="end_time" required value="10:30">
        </div>
        <div class="field span-2">
          <label>Instructor</label>
          <input type="text" name="instructor" placeholder="e.g. Dr. Alan Vega">
        </div>
        <div class="field span-2">
          <label>Online Class Link (optional)</label>
          <input type="url" name="meeting_link" placeholder="https://meet.google.com/... or Zoom URL">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">ADD SLOT</button>
      </div>
    </form>
  `);
  document.getElementById('timetableForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/admin/timetable', { method: 'POST', body: {
        batch_id: activeBatchId, day: f.get('day'), subject: f.get('subject'),
        start_time: f.get('start_time'), end_time: f.get('end_time'), instructor: f.get('instructor'),
        meeting_link: f.get('meeting_link') || null,
      }});
      toast('Timetable slot added');
      closeModal();
      showBatchDetail(activeBatchId);
      loadBatches();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteTimetableSlot(id) {
  try {
    await api('/api/admin/timetable/' + id, { method: 'DELETE' });
    toast('Slot deleted');
    showBatchDetail(activeBatchId);
    loadBatches();
  } catch (err) { toast(err.message, true); }
}

// ---------- Faculty ----------
async function loadFaculty() {
  const [faculty, courses] = await Promise.all([api('/api/admin/faculty'), api('/api/admin/courses')]);
  window._courses = courses;
  document.getElementById('facultyRows').innerHTML = faculty.length ? faculty.map(f => `
    <tr>
      <td><span class="badge badge-cyan">${esc(f.username)}</span></td>
      <td><strong>${esc(f.name)}</strong></td>
      <td class="muted">${esc(f.email || '—')}</td>
      <td class="muted">${esc(f.mobile || '—')}</td>
      <td>${(f.courses || []).map(c => `<span class="badge badge-purple" style="margin:1px">${esc(c.code)}</span>`).join('') || '—'}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick='openFacultyModal(${JSON.stringify(f)})'>EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteFaculty(${f.id}, '${esc(f.name)}')">DELETE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">✦</span>No faculty members yet.</div></td></tr>';
}

function openFacultyModal(faculty) {
  const isEdit = !!faculty;
  showModal(isEdit ? 'Edit Faculty' : 'Add Faculty', `
    <form id="facultyForm">
      <div class="form-grid">
        <div class="field">
          <label>Full Name</label>
          <input type="text" name="name" required value="${esc(faculty ? faculty.name : '')}" placeholder="e.g. Dr. Alan Vega">
        </div>
        ${isEdit ? '' : `
        <div class="field">
          <label>Faculty ID / Username</label>
          <input type="text" name="username" required placeholder="e.g. FAC004">
        </div>
        <div class="field">
          <label>Password</label>
          <input type="text" name="password" required placeholder="Initial password">
        </div>
        `}
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" value="${esc(faculty ? faculty.email || '' : '')}">
        </div>
        <div class="field">
          <label>Mobile</label>
          <input type="tel" name="mobile" value="${esc(faculty ? faculty.mobile || '' : '')}" placeholder="For SMS/WhatsApp">
        </div>
        <div class="field span-2">
          <label>Assigned Courses</label>
          <select name="course_ids" multiple size="5">
            ${(window._courses || []).map(c => {
              const has = faculty && (faculty.courses || []).some(fc => fc.id === c.id);
              return `<option value="${c.id}" ${has ? 'selected' : ''}>${esc(c.code)} — ${esc(c.title)}</option>`;
            }).join('')}
          </select>
          <small class="muted">Ctrl+click to select multiple courses.</small>
        </div>
        ${isEdit ? `
        <div class="field span-2">
          <label>Reset Password (leave blank to keep)</label>
          <input type="text" name="password" placeholder="New password">
        </div>` : ''}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${isEdit ? 'SAVE CHANGES' : 'CREATE FACULTY'}</button>
      </div>
    </form>
  `);
  document.getElementById('facultyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const course_ids = [...f.getAll('course_ids')].map(Number);
    const payload = { name: f.get('name'), email: f.get('email'), mobile: f.get('mobile'), course_ids };
    try {
      if (isEdit) {
        if (f.get('password')) payload.password = f.get('password');
        await api('/api/admin/faculty/' + faculty.id, { method: 'PUT', body: payload });
      } else {
        await api('/api/admin/faculty', { method: 'POST', body: {
          username: f.get('username'), password: f.get('password'), ...payload,
        }});
      }
      toast(isEdit ? 'Faculty updated' : 'Faculty created');
      closeModal();
      loadFaculty();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteFaculty(id, name) {
  if (!confirm(`Delete faculty "${name}"?`)) return;
  try {
    await api('/api/admin/faculty/' + id, { method: 'DELETE' });
    toast('Faculty deleted');
    loadFaculty();
  } catch (err) { toast(err.message, true); }
}

// ---------- Staff ----------
async function loadStaff() {
  const staff = await api('/api/admin/staff');
  window._staff = staff;
  document.getElementById('staffRows').innerHTML = staff.length ? staff.map(s => `
    <tr>
      <td><strong>${esc(s.name)}</strong></td>
      <td><span class="badge badge-purple">${esc(s.role)}</span></td>
      <td class="muted">${esc(s.phone || '—')}</td>
      <td class="muted">${esc(s.email || '—')}</td>
      <td><strong>${fmtMoney(s.salary)}</strong></td>
      <td class="muted">${esc(s.salary_type)}</td>
      <td class="muted">${esc(s.join_date || '—')}</td>
      <td><span class="badge ${s.status === 'active' ? 'badge-green' : 'badge-red'}">${esc(s.status)}</span></td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="openStaffModal(${s.id})">EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteStaff(${s.id}, '${esc(s.name)}')">DEL</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="9"><div class="empty-state"><span class="es-icon">☍</span>No staff records yet.</div></td></tr>';
}

function openStaffModal(id) {
  const s = (window._staff || []).find(x => x.id === id) || {};
  showModal(s.id ? 'Edit Staff — ' + s.name : 'Add Staff Member', `
    <form id="staffForm">
      <div class="form-grid">
        <div class="field">
          <label>Full Name</label>
          <input type="text" name="name" required value="${esc(s.name || '')}">
        </div>
        <div class="field">
          <label>Role</label>
          <input type="text" name="role" value="${esc(s.role || 'Staff')}" placeholder="e.g. Accountant, Office Manager">
        </div>
        <div class="field">
          <label>Phone</label>
          <input type="text" name="phone" value="${esc(s.phone || '')}">
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" value="${esc(s.email || '')}">
        </div>
        <div class="field">
          <label>Salary (Rs.)</label>
          <input type="number" name="salary" min="0" step="0.01" value="${s.salary || ''}">
        </div>
        <div class="field">
          <label>Salary Type</label>
          <select name="salary_type">
            <option value="monthly" ${s.salary_type === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="daily" ${s.salary_type === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="one-time" ${s.salary_type === 'one-time' ? 'selected' : ''}>One-time</option>
          </select>
        </div>
        <div class="field">
          <label>Join Date</label>
          <input type="date" name="join_date" value="${esc(s.join_date || '')}">
        </div>
        <div class="field">
          <label>Status</label>
          <select name="status">
            <option value="active" ${(s.status || 'active') === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${s.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${s.id ? 'SAVE CHANGES' : 'ADD STAFF'}</button>
      </div>
    </form>
  `);
  document.getElementById('staffForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      name: f.get('name'), role: f.get('role'), phone: f.get('phone'), email: f.get('email'),
      salary: Number(f.get('salary') || 0), salary_type: f.get('salary_type'),
      join_date: f.get('join_date'), status: f.get('status'),
    };
    try {
      if (s.id) await api('/api/admin/staff/' + s.id, { method: 'PUT', body });
      else await api('/api/admin/staff', { method: 'POST', body });
      toast(s.id ? 'Staff updated' : 'Staff added');
      closeModal();
      loadStaff();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteStaff(id, name) {
  if (!confirm(`Delete staff record for "${name}"?`)) return;
  try {
    await api('/api/admin/staff/' + id, { method: 'DELETE' });
    toast('Staff record deleted');
    loadStaff();
  } catch (err) { toast(err.message, true); }
}

// ---------- Parents ----------
async function loadParents() {
  const [parents, students] = await Promise.all([api('/api/admin/parents'), api('/api/admin/students')]);
  window._students = students;
  document.getElementById('parentRows').innerHTML = parents.length ? parents.map(p => `
    <tr>
      <td><span class="badge badge-cyan">${esc(p.username)}</span></td>
      <td><strong>${esc(p.name)}</strong></td>
      <td class="muted">${esc(p.email || '—')}</td>
      <td class="muted">${esc(p.mobile || '—')}</td>
      <td>${(p.children || []).map(c => `<span class="badge badge-purple" style="margin:1px">${esc(c.username)}</span>`).join('') || '—'}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick='openParentModal(${JSON.stringify(p)})'>EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteParent(${p.id}, '${esc(p.name)}')">DELETE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">◈</span>No parent accounts yet.</div></td></tr>';
}

function openParentModal(parent) {
  const isEdit = !!parent;
  showModal(isEdit ? 'Edit Parent' : 'Add Parent', `
    <form id="parentForm">
      <div class="form-grid">
        <div class="field">
          <label>Full Name</label>
          <input type="text" name="name" required value="${esc(parent ? parent.name : '')}" placeholder="e.g. Rajesh Sharma">
        </div>
        ${isEdit ? '' : `
        <div class="field">
          <label>Parent ID / Username</label>
          <input type="text" name="username" required placeholder="e.g. PAR007">
        </div>
        <div class="field">
          <label>Password</label>
          <input type="text" name="password" required placeholder="Initial password">
        </div>
        `}
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" value="${esc(parent ? parent.email || '' : '')}">
        </div>
        <div class="field">
          <label>Mobile</label>
          <input type="tel" name="mobile" value="${esc(parent ? parent.mobile || '' : '')}" placeholder="For SMS/WhatsApp">
        </div>
        <div class="field span-2">
          <label>Linked Children</label>
          <select name="student_ids" multiple size="5">
            ${(window._students || []).map(s => {
              const has = parent && (parent.children || []).some(c => c.id === s.id);
              return `<option value="${s.id}" ${has ? 'selected' : ''}>${esc(s.name)} (${esc(s.username)})</option>`;
            }).join('')}
          </select>
          <small class="muted">Ctrl+click to select multiple children.</small>
        </div>
        ${isEdit ? `
        <div class="field span-2">
          <label>Reset Password (leave blank to keep)</label>
          <input type="text" name="password" placeholder="New password">
        </div>` : ''}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${isEdit ? 'SAVE CHANGES' : 'CREATE PARENT'}</button>
      </div>
    </form>
  `);
  document.getElementById('parentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const student_ids = [...f.getAll('student_ids')].map(Number);
    const payload = { name: f.get('name'), email: f.get('email'), mobile: f.get('mobile'), student_ids };
    try {
      if (isEdit) {
        if (f.get('password')) payload.password = f.get('password');
        await api('/api/admin/parents/' + parent.id, { method: 'PUT', body: payload });
      } else {
        await api('/api/admin/parents', { method: 'POST', body: {
          username: f.get('username'), password: f.get('password'), ...payload,
        }});
      }
      toast(isEdit ? 'Parent updated' : 'Parent created');
      closeModal();
      loadParents();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteParent(id, name) {
  if (!confirm(`Delete parent account "${name}"?`)) return;
  try {
    await api('/api/admin/parents/' + id, { method: 'DELETE' });
    toast('Parent deleted');
    loadParents();
  } catch (err) { toast(err.message, true); }
}

// ---------- Exams & Results ----------
let activeExamId = null;
let activeExamMax = 100;

async function loadExams() {
  const [exams, courses] = await Promise.all([api('/api/admin/exams'), api('/api/admin/courses')]);
  window._courses = courses;
  window._exams = exams;
  document.getElementById('examRows').innerHTML = exams.length ? exams.map(x => `
    <tr>
      <td><strong>${esc(x.title)}</strong></td>
      <td><span class="badge badge-cyan">${esc(x.course_code)}</span></td>
      <td class="muted">${esc(x.exam_date || '—')}</td>
      <td>${x.available_from || x.available_to ? `<span class="badge badge-yellow">${x.available_from ? new Date(x.available_from).toLocaleDateString() : 'open'} → ${x.available_to ? new Date(x.available_to).toLocaleDateString() : 'no close'}</span>` : '<span class="badge badge-green">Always</span>'}</td>
      <td>${x.max_marks}</td>
      <td>${x.question_count ? `${x.question_count} Q` : '—'}${x.duration_minutes ? ` · ${x.duration_minutes} min` : ''}</td>
      <td><span class="badge badge-purple">${x.result_count}</span> <button class="btn btn-ghost btn-sm" onclick="showExamResults(${x.id}, '${esc(x.title)}')">ENTER</button></td>
      <td class="table-actions">
        <button class="btn btn-purple btn-sm" onclick="openExamQuestions(${x.id}, '${esc(x.title)}')">QUESTIONS</button>
        <button class="btn btn-ghost btn-sm" onclick='openExamModal(${JSON.stringify(x)})'>EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteExam(${x.id}, '${esc(x.title)}')">DELETE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">▤</span>No exams scheduled yet.</div></td></tr>';
}

function openExamModal(exam) {
  const isEdit = !!exam;
  showModal(isEdit ? 'Edit Exam' : 'Schedule Exam', `
    <form id="examForm">
      <div class="form-grid">
        <div class="field span-2">
          <label>Title</label>
          <input type="text" name="title" required value="${esc(exam ? exam.title : '')}" placeholder="e.g. CS101 Mid-Term">
        </div>
        <div class="field">
          <label>Course</label>
          <select name="course_id" required ${isEdit ? 'disabled' : ''}>
            ${(window._courses || []).map(c => `<option value="${c.id}" ${exam && exam.course_id === c.id ? 'selected' : ''}>${esc(c.code)} — ${esc(c.title)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Max Marks</label>
          <input type="number" name="max_marks" min="1" value="${exam ? exam.max_marks : 100}">
        </div>
        <div class="field">
          <label>Duration (minutes, 0 = no timer)</label>
          <input type="number" name="duration_minutes" min="0" value="${exam ? exam.duration_minutes || 0 : 0}">
        </div>
        <div class="field span-2">
          <label>Exam Date</label>
          <input type="date" name="exam_date" value="${esc(exam ? exam.exam_date || '' : '')}">
        </div>
        <div class="field">
          <label>Opens (datetime-local)</label>
          <input type="datetime-local" name="available_from" value="${exam && exam.available_from ? toLocalInput(exam.available_from) : ''}">
        </div>
        <div class="field">
          <label>Closes (datetime-local)</label>
          <input type="datetime-local" name="available_to" value="${exam && exam.available_to ? toLocalInput(exam.available_to) : ''}">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${isEdit ? 'SAVE CHANGES' : 'SCHEDULE EXAM'}</button>
      </div>
    </form>
  `);
  document.getElementById('examForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const payload = {
      title: f.get('title'), exam_date: f.get('exam_date') || null,
      max_marks: Number(f.get('max_marks')) || 100, duration_minutes: Number(f.get('duration_minutes')) || 0,
      available_from: toUtcIso(f.get('available_from')), available_to: toUtcIso(f.get('available_to')),
    };
    try {
      if (isEdit) {
        await api('/api/admin/exams/' + exam.id, { method: 'PUT', body: payload });
      } else {
        await api('/api/admin/exams', { method: 'POST', body: { ...payload, course_id: Number(f.get('course_id')) } });
      }
      toast(isEdit ? 'Exam updated' : 'Exam scheduled');
      closeModal();
      loadExams();
    } catch (err) { toast(err.message, true); }
  });
}

async function openExamQuestions(id, title) {
  const { exam, questions } = await api(`/api/admin/exams/${id}/questions`);
  showModal('Question Paper — ' + title, `
    <div class="alert" style="margin-bottom:14px">
      <strong>${questions.length}</strong> question(s), max marks: <strong>${exam.max_marks}</strong>.
      Students can take this exam online once the paper is published. Add questions below.
    </div>
    <div id="eqList"></div>
    <form id="eqForm">
      <div class="panel" style="padding:14px;margin-top:12px">
        <div class="form-grid">
          <div class="field span-2">
            <label>Question</label>
            <input type="text" name="text" required placeholder="e.g. Which data structure uses FIFO?">
          </div>
          ${[0, 1, 2, 3].map(i => `
            <div class="field">
              <label>Option ${String.fromCharCode(65 + i)}</label>
              <input type="text" name="opt${i}" required placeholder="Option ${String.fromCharCode(65 + i)}">
            </div>
          `).join('')}
          <div class="field">
            <label>Correct Option</label>
            <select name="correct_index">
              ${[0, 1, 2, 3].map(i => `<option value="${i}">${String.fromCharCode(65 + i)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Marks</label>
            <input type="number" name="marks" min="0" step="0.5" value="1">
          </div>
        </div>
        <div class="modal-actions" style="margin:12px 0 0">
          <button type="submit" class="btn btn-purple">ADD QUESTION</button>
        </div>
      </div>
    </form>
  `);
  const render = () => {
    const list = document.getElementById('eqList');
    if (!list) return;
    list.innerHTML = questions.length ? questions.map((q, qi) => `
      <div class="panel" style="padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div>
            <strong>${qi + 1}. ${esc(q.text)}</strong>
            <div class="muted" style="margin-top:4px">${q.options.map((o, oi) =>
              `<span class="badge ${oi === q.correct_index ? 'badge-green' : ''}" style="margin-right:6px">${String.fromCharCode(65 + oi)}. ${esc(o)}</span>`
            ).join('')} <span class="badge badge-purple">${q.marks} mark${q.marks !== 1 ? 's' : ''}</span></div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteExamQuestion(${id}, ${q.id}, ${q.marks})">DEL</button>
        </div>
      </div>
    `).join('') : '<div class="empty-state"><span class="es-icon">▤</span>No questions yet. Add the first one below.</div>';
  };
  render();
  document.getElementById('eqForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const options = [0, 1, 2, 3].map(i => String(f.get('opt' + i)).trim()).filter(Boolean);
    if (options.length < 2) return toast('At least two options are required', true);
    try {
      const added = await api(`/api/admin/exams/${id}/questions`, { method: 'POST', body: {
        text: f.get('text'), options, correct_index: Number(f.get('correct_index')), marks: Number(f.get('marks')) || 1,
      }});
      toast('Question added');
      f.set('text', '');
      [0, 1, 2, 3].forEach(i => f.set('opt' + i, ''));
      const { questions: updated } = await api(`/api/admin/exams/${id}/questions`);
      questions.length = 0; questions.push(...updated);
      render();
      document.querySelector('#eqList').closest('.modal').querySelector('.alert').innerHTML = `Updated: <strong>${questions.length}</strong> question(s), max marks <strong>${updated.reduce((s, q) => s + q.marks, 0)}</strong>.`;
      loadExams();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteExamQuestion(examId, qid) {
  if (!confirm('Delete this question?')) return;
  try {
    await api(`/api/admin/exams/${examId}/questions/${qid}`, { method: 'DELETE' });
    toast('Question deleted');
    loadExams();
    const examRow = (window._exams || []).find(x => x.id === examId);
    if (examRow) openExamQuestions(examId, examRow.title);
  } catch (err) { toast(err.message, true); }
}

async function deleteExam(id, title) {
  if (!confirm(`Delete exam "${title}"?`)) return;
  try {
    await api('/api/admin/exams/' + id, { method: 'DELETE' });
    toast('Exam deleted');
    loadExams();
  } catch (err) { toast(err.message, true); }
}

async function showExamResults(id, title) {
  activeExamId = id;
  const d = await api(`/api/admin/exams/${id}/results`);
  activeExamMax = d.exam.max_marks;
  document.getElementById('examResultsTitle').textContent = 'Enter Results — ' + title;
  document.getElementById('examResultsPanel').style.display = 'block';
  document.getElementById('examResultRows').innerHTML = d.rows.length ? d.rows.map(r => `
    <tr>
      <td><strong>${esc(r.name)}</strong> <span class="muted">(${esc(r.username)})</span></td>
      <td><input type="number" id="em-${r.id}" min="0" max="${d.exam.max_marks}" value="${r.marks != null ? r.marks : ''}"
                 placeholder="—" style="width:90px;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:5px"></td>
      <td class="muted">${d.exam.max_marks}</td>
    </tr>
  `).join('') : '<tr><td colspan="3"><div class="empty-state"><span class="es-icon">▤</span>No students enrolled in this course.</div></td></tr>';
}

function closeExamResults() {
  activeExamId = null;
  document.getElementById('examResultsPanel').style.display = 'none';
}

async function saveExamResults() {
  const marks = {};
  document.querySelectorAll('#examResultRows input').forEach(inp => {
    if (inp.value !== '') marks[inp.id.replace('em-', '')] = Number(inp.value);
  });
  if (!Object.keys(marks).length) return toast('Enter at least one mark', true);
  try {
    await api(`/api/admin/exams/${activeExamId}/results`, { method: 'POST', body: { marks } });
    toast('Results saved');
    showExamResults(activeExamId, document.getElementById('examResultsTitle').textContent.replace('Enter Results — ', ''));
    loadExams();
  } catch (err) { toast(err.message, true); }
}

// ---------- Payments & Receipts ----------
async function loadPayments() {
  const [payments, students] = await Promise.all([api('/api/admin/payments'), api('/api/admin/students')]);
  window._students = students;
  document.getElementById('paymentRows').innerHTML = payments.length ? payments.map(p => `
    <tr>
      <td><span class="badge badge-cyan">${esc(p.receipt_no)}</span></td>
      <td><strong>${esc(p.student_name)}</strong> <span class="muted">(${esc(p.username)})</span></td>
      <td class="muted">${esc(p.paid_at || '')}</td>
      <td class="muted">${esc(p.method || '')}</td>
      <td class="muted">${esc(p.note || '—')}</td>
      <td><strong>${fmtMoney(p.amount)}</strong></td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="viewReceipt(${p.id})">RECEIPT</button>
        <button class="btn btn-ghost btn-sm" onclick="viewGstInvoice(${p.id})">GST</button>
        <button class="btn btn-danger btn-sm" onclick="deletePayment(${p.id}, '${esc(p.receipt_no)}')">DEL</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">₿</span>No payments recorded yet.</div></td></tr>';
}

function openPaymentModal() {
  const preselect = window._payForStudent;
  window._payForStudent = null;
  showModal('Record Payment', `
    <form id="paymentForm">
      <div class="form-grid">
        <div class="field span-2">
          <label>Student</label>
          <select name="student_id" required>
            <option value="">Select student...</option>
            ${(window._students || []).map(s => `<option value="${s.id}" ${preselect == s.id ? 'selected' : ''}>${esc(s.name)} (${esc(s.username)}) — due ${fmtMoney(s.pending || 0)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Amount (Rs.)</label>
          <input type="number" name="amount" min="0.01" step="0.01" required placeholder="e.g. 600">
        </div>
        <div class="field">
          <label>Method</label>
          <select name="method">
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank Transfer</option>
          </select>
        </div>
        <div class="field span-2">
          <label>Note</label>
          <input type="text" name="note" placeholder="e.g. First installment">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">RECORD PAYMENT</button>
      </div>
    </form>
  `);
  document.getElementById('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/admin/payments', { method: 'POST', body: {
        student_id: Number(f.get('student_id')), amount: Number(f.get('amount')),
        method: f.get('method'), note: f.get('note'),
      }});
      toast('Payment recorded');
      closeModal();
      loadPayments();
    } catch (err) { toast(err.message, true); }
  });
}

async function viewReceipt(id) {
  const p = await api(`/api/admin/payments/${id}/receipt`);
  showModal('Payment Receipt — ' + p.receipt_no, `
    <div class="print-sheet">
      <div class="sheet-head">
        <div class="sheet-brand">VUMCA <span class="sheet-accent">hITECH</span> Computing</div>
        <div class="sheet-org">School of Computer Science &amp; Technology</div>
        <div class="sheet-addr">Plot 14, Sector 7, New Mumbai &ndash; 400 710</div>
        <div class="sheet-rule"></div>
        <div class="sheet-doctitle">OFFICIAL PAYMENT RECEIPT</div>
        <div class="sheet-docno">Receipt No. ${esc(p.receipt_no)} &nbsp;&bull;&nbsp; Date: ${esc(p.paid_at || '—')}</div>
      </div>
      <table class="sheet-table">
        <tr><th>Student Name</th><td>${esc(p.student_name)} <span class="sheet-muted">(${esc(p.username)})</span></td></tr>
        <tr><th>Payment Method</th><td>${esc(p.method || '—')}</td></tr>
        <tr><th>Amount Received</th><td class="sheet-amount">${fmtMoney(p.amount)}</td></tr>
        <tr><th>Amount In Words</th><td>${esc(toIndianWords(p.amount))}</td></tr>
        <tr><th>Note</th><td>${esc(p.note || '—')}</td></tr>
        <tr><th>Status</th><td><strong>PAID</strong></td></tr>
      </table>
      <div class="sheet-foot">
        <div class="sheet-sign">Authorized Signatory</div>
        <div class="sheet-note">This is a computer generated receipt.<br>Thank you for your payment.</div>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal()">CLOSE</button>
      <button class="btn btn-purple" onclick="window.print()">PRINT</button>
    </div>
  `);
}

async function viewGstInvoice(id) {
  const d = await api(`/api/admin/payments/${id}/invoice`);
  const t = d.tax;
  const itemRows = (d.items && d.items.length ? d.items : [{ code: '—', title: 'Course Fee' }])
    .map((c, i) => `<tr>
      <td>${i + 1}</td>
      <td>Course Fee — ${esc(c.title)} (${esc(c.code)})</td>
      <td>999293</td>
      <td>1</td>
      <td>${fmtMoney(t.taxable)}</td>
      <td>${fmtMoney(t.cgst)}</td>
      <td>${fmtMoney(t.sgst)}</td>
      <td>${fmtMoney(t.taxable + t.gst)}</td>
    </tr>`).join('');
  showModal('GST Tax Invoice — ' + d.invoice_no, `
    <div class="print-sheet">
      <div class="sheet-head">
        <div class="sheet-brand">VUMCA <span class="sheet-accent">hITECH</span> Computing</div>
        <div class="sheet-org">${esc(d.branch.name)} &middot; School of Computer Science &amp; Technology</div>
        <div class="sheet-addr">${esc(d.branch.address || '')} &nbsp;|&nbsp; ${esc(d.branch.phone || '')} &nbsp;|&nbsp; ${esc(d.branch.email || '')}</div>
        <div class="sheet-rule"></div>
        <div class="sheet-doctitle">TAX INVOICE</div>
        <div class="sheet-docno">Invoice No. ${esc(d.invoice_no)} &nbsp;&bull;&nbsp; Date: ${esc(d.payment.paid_at || '—')} &nbsp;&bull;&nbsp; GSTIN: ${esc(d.branch.gstin || '—')}</div>
      </div>
      <table class="sheet-table">
        <tr><th style="width:30%">Billed To</th><td><strong>${esc(d.student.name)}</strong> (${esc(d.student.username)})<br>${esc(d.student.mobile || '')} &nbsp; ${esc(d.student.email || '')}</td></tr>
        <tr><th>Receipt Ref</th><td>${esc(d.payment.receipt_no)} &nbsp;(${esc(d.payment.method || '—')}) &nbsp; ${esc(d.payment.note || '')}</td></tr>
      </table>
      <table class="sheet-table" style="margin-top:10px">
        <thead>
          <tr><th>#</th><th>Description</th><th>HSN</th><th>Qty</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Amount</th></tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table class="sheet-table" style="margin-top:10px">
        ${d.discount && d.discount.amount > 0 ? `
        <tr><th>Concession Applied</th><td class="sheet-muted">${esc(d.discount.label || '')} — waived <strong>${fmtMoney(d.discount.amount)}</strong></td></tr>
        ` : ''}
        <tr><th>Taxable Value</th><td>${fmtMoney(t.taxable)}</td></tr>
        <tr><th>CGST @ ${(t.rate / 2).toFixed(1)}%</th><td>${fmtMoney(t.cgst)}</td></tr>
        <tr><th>SGST @ ${(t.rate / 2).toFixed(1)}%</th><td>${fmtMoney(t.sgst)}</td></tr>
        <tr><th>Total (incl. GST @ ${t.rate}%)</th><td class="sheet-amount">${fmtMoney(t.total)}</td></tr>
        <tr><th>Amount In Words</th><td>${esc(toIndianWords(t.total))}</td></tr>
      </table>
      <div class="sheet-foot">
        <div class="sheet-sign">For VUMCA hITECH Computing</div>
        <div class="sheet-note">This is a computer generated tax invoice.<br>${esc(d.branch.gstin ? 'GSTIN: ' + d.branch.gstin : '')}</div>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal()">CLOSE</button>
      <button class="btn btn-purple" onclick="window.print()">PRINT</button>
    </div>
  `);
}

function toIndianWords(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = x => x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
  const three = x => {
    const h = Math.floor(x / 100), r = x % 100;
    return (h ? ones[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : '');
  };
  let crore = Math.floor(n / 10000000); n %= 10000000;
  let lakh = Math.floor(n / 100000); n %= 100000;
  let thousand = Math.floor(n / 1000); n %= 1000;
  const parts = [];
  if (crore) parts.push(two(crore) + ' Crore');
  if (lakh) parts.push(two(lakh) + ' Lakh');
  if (thousand) parts.push(two(thousand) + ' Thousand');
  if (n) parts.push(three(n));
  return parts.join(' ') + ' Rupees Only';
}

async function deletePayment(id, receiptNo) {
  if (!confirm(`Delete receipt ${receiptNo}?`)) return;
  try {
    await api('/api/admin/payments/' + id, { method: 'DELETE' });
    toast('Payment deleted');
    loadPayments();
  } catch (err) { toast(err.message, true); }
}

// ---------- Expenses ----------
async function loadExpenses() {
  const expenses = await api('/api/admin/expenses');
  window._expenses = expenses;
  document.getElementById('expenseRows').innerHTML = expenses.length ? expenses.map(e => `
    <tr>
      <td><span class="badge badge-purple">${esc(e.category)}</span></td>
      <td><strong>${fmtMoney(e.amount)}</strong></td>
      <td class="muted">${esc(e.note || '—')}</td>
      <td class="muted">${esc(e.expense_date || e.created_at || '')}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="openExpenseModal(${e.id})">EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id}, '${esc(e.category)}')">DEL</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">◍</span>No expenses recorded yet.</div></td></tr>';
}

function openExpenseModal(id) {
  const e = (window._expenses || []).find(x => x.id === id) || {};
  showModal(e.id ? 'Edit Expense' : 'Add Expense', `
    <form id="expenseForm">
      <div class="form-grid">
        <div class="field">
          <label>Category</label>
          <select name="category">
            ${['Rent', 'Salaries', 'Electricity', 'Internet', 'Stationery', 'Maintenance', 'Marketing', 'Travel', 'Other'].map(c =>
              `<option value="${c}" ${e.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Amount (Rs.)</label>
          <input type="number" name="amount" min="0.01" step="0.01" required value="${e.amount != null ? e.amount : ''}" placeholder="e.g. 5000">
        </div>
        <div class="field">
          <label>Date</label>
          <input type="date" name="expense_date" value="${esc(e.expense_date || '')}">
        </div>
        <div class="field">
          <label>Note</label>
          <input type="text" name="note" value="${esc(e.note || '')}" placeholder="e.g. Monthly rent">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${e.id ? 'SAVE CHANGES' : 'ADD EXPENSE'}</button>
      </div>
    </form>
  `);
  document.getElementById('expenseForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const body = {
      category: f.get('category'), amount: Number(f.get('amount')),
      note: f.get('note'), expense_date: f.get('expense_date') || undefined,
    };
    try {
      if (e.id) await api('/api/admin/expenses/' + e.id, { method: 'PUT', body });
      else await api('/api/admin/expenses', { method: 'POST', body });
      toast(e.id ? 'Expense updated' : 'Expense recorded');
      closeModal();
      loadExpenses();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteExpense(id, category) {
  if (!confirm(`Delete this ${category} expense?`)) return;
  try {
    await api('/api/admin/expenses/' + id, { method: 'DELETE' });
    toast('Expense deleted');
    loadExpenses();
  } catch (err) { toast(err.message, true); }
}

// ---------- Certificates ----------
async function loadCertificates() {
  const [certificates, students, courses] = await Promise.all([
    api('/api/admin/certificates'), api('/api/admin/students'), api('/api/admin/courses'),
  ]);
  window._students = students;
  window._courses = courses;
  window._certificates = certificates;
  document.getElementById('certificateRows').innerHTML = certificates.length ? certificates.map(c => `
    <tr>
      <td><span class="badge badge-cyan">${esc(c.cert_no)}</span></td>
      <td><strong>${esc(c.student_name)}</strong> <span class="muted">(${esc(c.username)})</span></td>
      <td>${esc(c.course_code)} — <span class="muted">${esc(c.course_title)}</span></td>
      <td><span class="badge badge-purple">${esc(c.type)}</span></td>
      <td class="muted">${esc(c.issued_date || '')}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="viewCertificate(${c.id})">VIEW</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCertificate(${c.id}, '${esc(c.cert_no)}')">DEL</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">⛁</span>No certificates issued yet.</div></td></tr>';
}

function openCertificateModal() {
  showModal('Issue Certificate', `
    <form id="certificateForm">
      <div class="form-grid">
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
        <div class="field span-2">
          <label>Type</label>
          <select name="type">
            <option value="completion">Course Completion</option>
            <option value="achievement">Achievement</option>
            <option value="participation">Participation</option>
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">ISSUE CERTIFICATE</button>
      </div>
    </form>
  `);
  document.getElementById('certificateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/admin/certificates', { method: 'POST', body: {
        student_id: Number(f.get('student_id')), course_id: Number(f.get('course_id')), type: f.get('type'),
      }});
      toast('Certificate issued');
      closeModal();
      loadCertificates();
    } catch (err) { toast(err.message, true); }
  });
}

async function viewCertificate(id) {
  const cert = (window._certificates || []).find(x => x.id === id);
  if (!cert) return toast('Certificate not found', true);
  const student = (window._students || []).find(s => s.id === cert.student_id);
  const course = (window._courses || []).find(c => c.id === cert.course_id);
  const typeLabel = cert.type === 'completion' ? 'CERTIFICATE OF COMPLETION'
    : cert.type === 'achievement' ? 'CERTIFICATE OF ACHIEVEMENT'
    : 'CERTIFICATE OF PARTICIPATION';
  showModal('Certificate', `
    <div class="print-sheet">
      <div class="sheet-head">
        <div class="sheet-brand">VUMCA <span class="sheet-accent">hITECH</span> Computing</div>
        <div class="sheet-org">School of Computer Science &amp; Technology</div>
        <div class="sheet-addr">Plot 14, Sector 7, New Mumbai &ndash; 400 710</div>
        <div class="sheet-rule"></div>
        <div class="sheet-doctitle">${typeLabel}</div>
        <div class="sheet-docno">Certificate No. ${esc(cert.cert_no)} &nbsp;&bull;&nbsp; Date: ${esc(cert.issued_date || '—')}</div>
      </div>
      <div class="sheet-certframe">
        <div class="sheet-certbody">
          <div class="sheet-certsub">This is to proudly certify that</div>
          <div class="sheet-certname">${esc(student ? student.name : 'Student')}</div>
          <div class="sheet-certsub">has successfully completed the course</div>
          <div class="sheet-certcourse">${esc(course ? course.title : '')}</div>
          <div class="sheet-certsub">(${esc(course ? course.code : '')})</div>
          <div class="sheet-certsub">Awarded for demonstrating proficiency in the subject matter.</div>
        </div>
      </div>
      <div class="sheet-foot" style="margin-top:22px">
        <div class="sheet-sign">Authorized Signatory<br><span class="sheet-muted">Principal</span></div>
        <div class="sheet-sign" style="text-align:right">VUMCA hITECH Computing<br><span class="sheet-muted">${esc(course ? course.code : '')}</span></div>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal()">CLOSE</button>
      <button class="btn btn-purple" onclick="window.print()">PRINT</button>
    </div>
  `);
}

async function deleteCertificate(id, certNo) {
  if (!confirm(`Revoke certificate ${certNo}?`)) return;
  try {
    await api('/api/admin/certificates/' + id, { method: 'DELETE' });
    toast('Certificate deleted');
    loadCertificates();
  } catch (err) { toast(err.message, true); }
}

// ---------- Notifications / Reminders ----------
async function loadNotifications() {
  const [notifications, students] = await Promise.all([api('/api/admin/notifications'), api('/api/admin/students')]);
  window._students = students;
  const sel = document.getElementById('notifyStudents');
  sel.innerHTML = students.map(s =>
    `<option value="${s.id}">${esc(s.name)} (${esc(s.username)})${s.mobile ? '' : ' — no mobile'}</option>`
  ).join('');
  try {
    const { configured } = await api('/api/admin/notifications/status');
    const badge = document.getElementById('notifyStatusBadge');
    badge.textContent = configured ? 'SMS SERVICE READY' : 'SMS NOT CONFIGURED — SIMULATION MODE';
    badge.classList.toggle('badge-purple', configured);
    badge.classList.toggle('badge-yellow', !configured);
    const hint = document.getElementById('notifyHint');
    hint.innerHTML = configured
      ? '<strong>WhatsApp:</strong> messages go to <code>whatsapp:+91…</code>. Recipients must have WhatsApp on that number, and your Twilio sender must be WhatsApp-enabled (Twilio Console → Messaging → Senders). If a message shows <code>failed</code>, check the log detail.'
      : 'Add <code>SMS_TWILIO_ACCOUNT_SID</code>, <code>SMS_TWILIO_AUTH_TOKEN</code> and <code>SMS_TWILIO_FROM</code> to your <code>.env</code> to send real SMS/WhatsApp. Until then, reminders are recorded in simulation mode.';
  } catch (_) {}
  document.getElementById('notificationRows').innerHTML = notifications.length ? notifications.map(n => `
    <tr>
      <td><strong>${esc(n.student_name)}</strong> <span class="muted">(${esc(n.username)})</span></td>
      <td><span class="badge badge-cyan">${esc(n.channel)}</span></td>
      <td><span class="badge badge-purple">${esc(n.purpose)}</span></td>
      <td class="muted">${esc(n.message || '—')}</td>
      <td><span class="badge ${n.status === 'sent' ? 'badge-green' : 'badge-red'}">${esc(n.status)}</span></td>
      <td class="muted">${esc(n.sent_at || '')}</td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">✉</span>No notifications sent yet.</div></td></tr>';
}

async function sendNotifications() {
  const channel = document.getElementById('notifyChannel').value;
  const purpose = document.getElementById('notifyPurpose').value;
  const student_ids = [...document.getElementById('notifyStudents').selectedOptions].map(o => Number(o.value));
  const message = document.getElementById('notifyMessage').value.trim();
  if (!student_ids.length) return toast('Select at least one student', true);
  try {
    const res = await api('/api/admin/notifications/send-all', {
      method: 'POST', body: { channel, purpose, student_ids, message: message || undefined },
    });
    toast(`Sent ${res.sent} reminder(s)`);
    document.getElementById('notifyMessage').value = '';
    document.getElementById('notifyStudents').selectedIndex = -1;
    loadNotifications();
  } catch (err) { toast(err.message, true); }
}

// ---------- Reports ----------
let reportCache = null;

async function loadReports() {
  const type = document.getElementById('reportType').value;
  const report = await api('/api/admin/reports/' + type);
  reportCache = report;
  const view = document.getElementById('reportsView');
  view.innerHTML = `
    <div class="stat-grid" style="margin-bottom:16px">
      ${report.summary.map(s => `
        <div class="stat-card purple"><div class="stat-num">${esc(s.value)}</div><div class="stat-label">${esc(s.label)}</div></div>
      `).join('')}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${report.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${report.rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function exportCsv() {
  if (!reportCache) return toast('Generate a report first', true);
  const rows = [reportCache.columns, ...reportCache.rows];
  const csv = rows.map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = reportCache.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function fmtMoney(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// ---------- Auto fee reminders ----------
let reminderStatus = null;

async function loadReminderStatus() {
  try {
    reminderStatus = await api('/api/admin/reminders/status');
    document.getElementById('remindCfgBadge').textContent =
      reminderStatus.configured ? 'TWILIO CONFIGURED' : 'SIMULATION MODE';
    document.getElementById('remindCfgBadge').className =
      'badge ' + (reminderStatus.configured ? 'badge-green' : 'badge-yellow');
    document.getElementById('remindStatus').innerHTML =
      `<b>Enabled:</b> ${reminderStatus.enabled ? 'YES' : 'NO'} &nbsp;|&nbsp; ` +
      `<b>Next run:</b> ${reminderStatus.nextRun ? new Date(reminderStatus.nextRun).toLocaleString() : '—'} &nbsp;|&nbsp; ` +
      `<b>Last run:</b> ${reminderStatus.lastRun ? new Date(reminderStatus.lastRun).toLocaleString() : 'never'} &nbsp;|&nbsp; ` +
      `<b>Sent:</b> ${reminderStatus.sent} &nbsp;|&nbsp; ` +
      `<b>Failed:</b> ${reminderStatus.failed} &nbsp;|&nbsp; ` +
      `<b>Skipped:</b> ${reminderStatus.skipped}`;
  } catch (err) { toast(err.message, true); }
}

async function runRemindersNow() {
  try {
    const res = await api('/api/admin/reminders/run-now', { method: 'POST' });
    toast(`Reminder run complete: ${res.sent} sent, ${res.failed} failed, ${res.skipped} skipped`);
    loadReminderStatus();
    loadReminderLog();
  } catch (err) { toast(err.message, true); }
}

async function loadReminderLog() {
  try {
    const log = await api('/api/admin/reminders/log');
    document.getElementById('remindLogRows').innerHTML = log.length ? log.map(r => `
      <tr>
        <td><span class="badge badge-cyan">${esc(r.username)}</span> ${esc(r.student_name)}</td>
        <td class="muted">${esc(r.install_id || '—')}</td>
        <td class="muted">${esc(r.due_date || '—')}</td>
        <td>${fmtMoney(r.amount)}</td>
        <td><span class="badge ${r.status === 'sent' ? 'badge-green' : 'badge-red'}">${esc(r.status)}</span></td>
        <td class="muted">${esc(r.sent_on || '—')}</td>
        <td class="muted" style="max-width:360px">${esc(r.message || '—')}</td>
      </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">◍</span>No reminders sent yet. Press RUN NOW.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

// ---------- Notices ----------
let noticeCache = [];

async function loadNotices() {
  try {
    noticeCache = await api('/api/admin/notices');
    if (!window._courses) window._courses = await api('/api/admin/courses');
    if (!window._batches) window._batches = await api('/api/admin/batches');
    document.getElementById('noticeGrid').innerHTML = noticeCache.length ? noticeCache.map(n => `
      <div class="notice-card">
        <h3>${esc(n.title)}</h3>
        <div class="nc-meta">Published ${esc(n.publish_date || '—')}${n.expires_on ? ' · Expires ' + esc(n.expires_on) : ''}
          <div style="margin-top:6px">
            <span class="badge ${n.course_id ? 'badge-purple' : 'badge-cyan'}">${n.course_id ? `${esc(n.course_code)}` : 'ALL COURSES'}</span>
            ${n.batch_id ? `<span class="badge badge-purple">${esc(n.batch_name)}</span>` : ''}
          </div>
        </div>
        <div class="nc-body">${esc(n.body || '')}</div>
        ${n.meeting_link ? `<div style="margin-top:10px"><a class="btn btn-purple btn-sm" href="${esc(n.meeting_link)}" target="_blank" rel="noopener">JOIN ONLINE CLASS</a></div>` : ''}
        <div class="nc-actions">
          <button class="btn btn-ghost btn-sm" onclick="openNoticeModal(${n.id})">EDIT</button>
          <button class="btn btn-danger btn-sm" onclick="deleteNotice(${n.id}, '${esc(n.title)}')">DELETE</button>
        </div>
      </div>`).join('') : '<div class="empty-state"><span class="es-icon">⚑</span>No notices yet.</div>';
  } catch (err) { toast(err.message, true); }
}

function openNoticeModal(id) {
  const n = noticeCache.find(x => x.id === id) || {};
  const courses = window._courses || [];
  const batches = window._batches || [];
  const courseOpts = courses.map(c =>
    `<option value="${c.id}" ${n.course_id === c.id ? 'selected' : ''}>${esc(c.code)} — ${esc(c.title)}</option>`).join('');
  const batchOpts = batches.filter(b => !n.course_id || b.course_id === n.course_id).map(b =>
    `<option value="${b.id}" ${n.batch_id === b.id ? 'selected' : ''}>${esc(b.name)} (${esc(b.course_code)})</option>`).join('');
  showModal(n.id ? 'Edit Notice' : 'Add Notice', `
    <form id="noticeForm">
      <div class="form-grid">
        <div class="field span-2">
          <label>Title</label>
          <input type="text" name="title" required value="${esc(n.title || '')}" placeholder="e.g. Exam Schedule">
        </div>
        <div class="field span-2">
          <label>Body</label>
          <textarea name="body" rows="5" placeholder="Full notice text...">${esc(n.body || '')}</textarea>
        </div>
        <div class="field">
          <label>Publish Date</label>
          <input type="date" name="publish_date" value="${esc(n.publish_date || todayStr())}">
        </div>
        <div class="field">
          <label>Expires On (optional)</label>
          <input type="date" name="expires_on" value="${esc(n.expires_on || '')}">
        </div>
        <div class="field">
          <label>Target Course (optional)</label>
          <select name="course_id" id="noticeCourse">
            <option value="">All Courses</option>
            ${courseOpts}
          </select>
          <small class="muted">Leave blank to send to everyone.</small>
        </div>
        <div class="field">
          <label>Target Batch (optional)</label>
          <select name="batch_id" id="noticeBatch">
            <option value="">All Batches</option>
            ${batchOpts}
          </select>
          <small class="muted">Requires a course selected above.</small>
        </div>
        <div class="field span-2">
          <label>Online Class Link (optional)</label>
          <input type="url" name="meeting_link" value="${esc(n.meeting_link || '')}" placeholder="https://meet.google.com/... or Zoom URL">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${n.id ? 'SAVE CHANGES' : 'ADD NOTICE'}</button>
      </div>
    </form>`);
  document.getElementById('noticeCourse').addEventListener('change', (e) => {
    const cid = Number(e.target.value) || 0;
    const batchSel = document.getElementById('noticeBatch');
    batchSel.innerHTML = '<option value="">All Batches</option>' + batches
      .filter(b => !cid || b.course_id === cid)
      .map(b => `<option value="${b.id}">${esc(b.name)} (${esc(b.course_code)})</option>`).join('');
    batchSel.value = n.batch_id && (!cid || batches.find(b => b.id === n.batch_id)?.course_id === cid) ? n.batch_id : '';
  });
  document.getElementById('noticeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      title: f.get('title'), body: f.get('body'),
      publish_date: f.get('publish_date') || null, expires_on: f.get('expires_on') || null,
      meeting_link: f.get('meeting_link') || null,
      course_id: f.get('course_id') || null, batch_id: f.get('batch_id') || null,
    };
    try {
      if (n.id) await api('/api/admin/notices/' + n.id, { method: 'PUT', body });
      else await api('/api/admin/notices', { method: 'POST', body });
      toast(n.id ? 'Notice updated' : 'Notice published');
      closeModal();
      loadNotices();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteNotice(id, title) {
  if (!confirm(`Delete notice "${title}"?`)) return;
  try {
    await api('/api/admin/notices/' + id, { method: 'DELETE' });
    toast('Notice deleted');
    loadNotices();
  } catch (err) { toast(err.message, true); }
}

// ---------- Vendors ----------
let vendorCache = [];

async function loadVendors() {
  try {
    vendorCache = await api('/api/admin/vendors');
    document.getElementById('vendorRows').innerHTML = vendorCache.length ? vendorCache.map(v => `
      <tr>
        <td><strong>${esc(v.name)}</strong><br><span class="muted">${esc(v.address || '')}</span></td>
        <td class="muted">${esc(v.phone || '—')}<br>${esc(v.email || '')}</td>
        <td class="muted">${esc(v.gstin || '—')}</td>
        <td>${fmtMoney(v.total_purchases || 0)}</td>
        <td><span class="badge ${v.status === 'active' ? 'badge-green' : 'badge-yellow'}">${esc(v.status)}</span></td>
        <td class="table-actions">
          <button class="btn btn-ghost btn-sm" onclick="openVendorModal(${v.id})">EDIT</button>
          <button class="btn btn-danger btn-sm" onclick="deleteVendor(${v.id}, '${esc(v.name)}')">DEL</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">₨</span>No vendors yet.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

function openVendorModal(id) {
  const v = vendorCache.find(x => x.id === id) || {};
  showModal(v.id ? 'Edit Vendor' : 'Add Vendor', `
    <form id="vendorForm">
      <div class="form-grid">
        <div class="field span-2">
          <label>Vendor Name</label>
          <input type="text" name="name" required value="${esc(v.name || '')}">
        </div>
        <div class="field"><label>Phone</label><input type="text" name="phone" value="${esc(v.phone || '')}"></div>
        <div class="field"><label>Email</label><input type="email" name="email" value="${esc(v.email || '')}"></div>
        <div class="field span-2"><label>GSTIN</label><input type="text" name="gstin" value="${esc(v.gstin || '')}"></div>
        <div class="field span-2"><label>Address</label><input type="text" name="address" value="${esc(v.address || '')}"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${v.id ? 'SAVE CHANGES' : 'ADD VENDOR'}</button>
      </div>
    </form>`);
  document.getElementById('vendorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { name: f.get('name'), phone: f.get('phone'), email: f.get('email'), gstin: f.get('gstin'), address: f.get('address') };
    try {
      if (v.id) await api('/api/admin/vendors/' + v.id, { method: 'PUT', body });
      else await api('/api/admin/vendors', { method: 'POST', body });
      toast(v.id ? 'Vendor updated' : 'Vendor added');
      closeModal();
      loadVendors();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteVendor(id, name) {
  if (!confirm(`Delete vendor "${name}"?`)) return;
  try {
    await api('/api/admin/vendors/' + id, { method: 'DELETE' });
    toast('Vendor deleted');
    loadVendors();
  } catch (err) { toast(err.message, true); }
}

// ---------- Purchases ----------
async function loadPurchases() {
  try {
    const rows = await api('/api/admin/vendor-purchases');
    document.getElementById('purchaseRows').innerHTML = rows.length ? rows.map(p => `
      <tr>
        <td class="muted">${esc(p.bill_no || '—')}</td>
        <td><strong>${esc(p.vendor_name || '—')}</strong></td>
        <td class="muted">${esc(p.bill_date || '—')}</td>
        <td>${fmtMoney(p.amount)}</td>
        <td>${p.gst_rate}%</td>
        <td><span class="badge badge-cyan">${fmtMoney(p.input_credit)}</span></td>
        <td class="muted">${esc(p.category || '—')}</td>
        <td class="table-actions">
          <button class="btn btn-danger btn-sm" onclick="deletePurchase(${p.id})">DEL</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="8"><div class="empty-state"><span class="es-icon">₨</span>No purchases recorded.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

function openPurchaseModal() {
  showModal('Add Vendor Purchase', `
    <form id="purchaseForm">
      <div class="form-grid">
        <div class="field span-2">
          <label>Vendor</label>
          <select name="vendor_id" required>${(vendorCache || []).map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Bill No</label><input type="text" name="bill_no" placeholder="e.g. INV-104"></div>
        <div class="field"><label>Bill Date</label><input type="date" name="bill_date" value="${todayStr()}"></div>
        <div class="field"><label>Amount (incl. GST)</label><input type="number" name="amount" step="0.01" min="0" required></div>
        <div class="field"><label>GST Rate (%)</label><input type="number" name="gst_rate" value="18" min="0" max="28" step="0.5"></div>
        <div class="field"><label>Category</label><input type="text" name="category" placeholder="Equipment / Stationery / Rent"></div>
        <div class="field span-2"><label>Note</label><input type="text" name="note"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">ADD PURCHASE</button>
      </div>
    </form>`);
  document.getElementById('purchaseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      vendor_id: Number(f.get('vendor_id')), bill_no: f.get('bill_no'),
      bill_date: f.get('bill_date'), amount: Number(f.get('amount')),
      gst_rate: Number(f.get('gst_rate')), category: f.get('category'), note: f.get('note'),
    };
    try {
      await api('/api/admin/vendor-purchases', { method: 'POST', body });
      toast('Purchase added — input credit recorded');
      closeModal();
      loadPurchases();
      loadGstSummary();
    } catch (err) { toast(err.message, true); }
  });
}

async function deletePurchase(id) {
  if (!confirm('Delete this purchase record?')) return;
  try {
    await api('/api/admin/vendor-purchases/' + id, { method: 'DELETE' });
    toast('Purchase deleted');
    loadPurchases();
    loadGstSummary();
  } catch (err) { toast(err.message, true); }
}

// ---------- GST summary ----------
async function loadGstSummary() {
  try {
    const month = document.getElementById('gstMonth').value || todayStr().slice(0, 7);
    const g = await api('/api/admin/gst-summary?month=' + month);
    document.getElementById('gstSummaryView').innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-num">${fmtMoney(g.output.gst)}</div><div class="stat-label">Output GST (${g.output.invoices} invoices)</div></div>
        <div class="stat-card purple"><div class="stat-num">${fmtMoney(g.input.input_credit)}</div><div class="stat-label">Input Credit (${g.input.bills} bills)</div></div>
        <div class="stat-card ${g.net_payable > 0 ? 'green' : 'purple'}"><div class="stat-num">${fmtMoney(g.net_payable)}</div><div class="stat-label">Net GST Payable</div></div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="panel-header"><h2>Taxable Value (${month})</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Output — Taxable Value</th><th>Output GST</th><th>Input Credit</th><th>Net Payable</th></tr></thead>
          <tbody><tr>
            <td>${fmtMoney(g.output.taxable_value)}</td>
            <td>${fmtMoney(g.output.gst)}</td>
            <td>${fmtMoney(g.input.input_credit)}</td>
            <td><strong>${fmtMoney(g.net_payable)}</strong></td>
          </tr></tbody>
        </table></div>
      </div>`;
  } catch (err) { toast(err.message, true); }
}

// ---------- Assets ----------
let assetCache = [];

async function loadAssets() {
  try {
    assetCache = await api('/api/admin/assets');
    const total = assetCache.reduce((s, a) => s + (a.cost || 0), 0);
    document.getElementById('assetRows').innerHTML = assetCache.length ? assetCache.map(a => `
      <tr>
        <td><strong>${esc(a.name)}</strong><br><span class="muted">${esc(a.note || '')}</span></td>
        <td class="muted">${esc(a.category || '—')}</td>
        <td class="muted">${esc(a.tag_no || '—')}</td>
        <td>${fmtMoney(a.cost)}</td>
        <td class="muted">${esc(a.purchase_date || '—')}</td>
        <td><span class="badge ${a.status === 'in-use' ? 'badge-green' : a.status === 'maintenance' ? 'badge-yellow' : 'badge-red'}">${esc(a.status)}</span></td>
        <td class="table-actions">
          <button class="btn btn-ghost btn-sm" onclick="openAssetModal(${a.id})">EDIT</button>
          <button class="btn btn-danger btn-sm" onclick="deleteAsset(${a.id}, '${esc(a.name)}')">DEL</button>
        </td>
      </tr>`).join('') + `<tr><td colspan="7" style="text-align:right"><strong>Total value: ${fmtMoney(total)}</strong></td></tr>`
      : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">▣</span>No assets registered.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

function openAssetModal(id) {
  const a = assetCache.find(x => x.id === id) || {};
  showModal(a.id ? 'Edit Asset' : 'Add Asset', `
    <form id="assetForm">
      <div class="form-grid">
        <div class="field span-2"><label>Asset Name</label><input type="text" name="name" required value="${esc(a.name || '')}"></div>
        <div class="field"><label>Category</label><input type="text" name="category" value="${esc(a.category || '')}"></div>
        <div class="field"><label>Tag No</label><input type="text" name="tag_no" value="${esc(a.tag_no || '')}"></div>
        <div class="field"><label>Cost (Rs.)</label><input type="number" name="cost" min="0" step="0.01" value="${a.cost || 0}"></div>
        <div class="field"><label>Purchase Date</label><input type="date" name="purchase_date" value="${esc(a.purchase_date || '')}"></div>
        <div class="field"><label>Status</label>
          <select name="status">
            <option value="in-use" ${a.status === 'in-use' ? 'selected' : ''}>In Use</option>
            <option value="maintenance" ${a.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
            <option value="disposed" ${a.status === 'disposed' ? 'selected' : ''}>Disposed</option>
          </select>
        </div>
        <div class="field span-2"><label>Note</label><input type="text" name="note" value="${esc(a.note || '')}"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${a.id ? 'SAVE CHANGES' : 'ADD ASSET'}</button>
      </div>
    </form>`);
  document.getElementById('assetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      name: f.get('name'), category: f.get('category'), tag_no: f.get('tag_no'),
      cost: Number(f.get('cost')), purchase_date: f.get('purchase_date'),
      status: f.get('status'), note: f.get('note'),
    };
    try {
      if (a.id) await api('/api/admin/assets/' + a.id, { method: 'PUT', body });
      else await api('/api/admin/assets', { method: 'POST', body });
      toast(a.id ? 'Asset updated' : 'Asset added');
      closeModal();
      loadAssets();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteAsset(id, name) {
  if (!confirm(`Delete asset "${name}"?`)) return;
  try {
    await api('/api/admin/assets/' + id, { method: 'DELETE' });
    toast('Asset deleted');
    loadAssets();
  } catch (err) { toast(err.message, true); }
}

// ---------- Inventory ----------
let inventoryCache = [];

async function loadInventory() {
  try {
    inventoryCache = await api('/api/admin/inventory');
    document.getElementById('inventoryRows').innerHTML = inventoryCache.length ? inventoryCache.map(i => `
      <tr>
        <td><strong>${esc(i.name)}</strong><br><span class="muted">${esc(i.note || '')}</span></td>
        <td class="muted">${esc(i.category || '—')}</td>
        <td class="muted">${esc(i.sku || '—')}</td>
        <td><strong>${i.quantity}</strong> ${esc(i.unit || 'pcs')}${Number(i.quantity) <= Number(i.reorder_level) && Number(i.reorder_level) > 0 ? ' <span class="badge badge-red">LOW</span>' : ''}</td>
        <td class="muted">${esc(i.unit || 'pcs')}</td>
        <td>${fmtMoney(i.cost_price)}</td>
        <td class="muted">${i.reorder_level || 0}</td>
        <td class="table-actions">
          <button class="btn btn-ghost btn-sm" onclick="openInventoryModal(${i.id})">EDIT</button>
          <button class="btn btn-purple btn-sm" onclick="openTransactModal(${i.id})">STOCK</button>
          <button class="btn btn-danger btn-sm" onclick="deleteInventory(${i.id}, '${esc(i.name)}')">DEL</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="8"><div class="empty-state"><span class="es-icon">≋</span>No inventory items yet.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

function openInventoryModal(id) {
  const i = inventoryCache.find(x => x.id === id) || {};
  showModal(i.id ? 'Edit Inventory Item' : 'Add Inventory Item', `
    <form id="inventoryForm">
      <div class="form-grid">
        <div class="field span-2"><label>Item Name</label><input type="text" name="name" required value="${esc(i.name || '')}"></div>
        <div class="field"><label>Category</label><input type="text" name="category" value="${esc(i.category || '')}" placeholder="Stationery, Uniforms..."></div>
        <div class="field"><label>SKU</label><input type="text" name="sku" value="${esc(i.sku || '')}"></div>
        <div class="field"><label>Quantity</label><input type="number" name="quantity" min="0" step="1" value="${i.id ? i.quantity : 0}"></div>
        <div class="field"><label>Unit</label><input type="text" name="unit" value="${esc(i.unit || 'pcs')}" placeholder="pcs, sets, boxes..."></div>
        <div class="field"><label>Reorder Level</label><input type="number" name="reorder_level" min="0" step="1" value="${i.reorder_level || 0}"></div>
        <div class="field"><label>Cost Price (Rs.)</label><input type="number" name="cost_price" min="0" step="0.01" value="${i.cost_price || 0}"></div>
        <div class="field span-2"><label>Note</label><input type="text" name="note" value="${esc(i.note || '')}"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${i.id ? 'SAVE CHANGES' : 'ADD ITEM'}</button>
      </div>
    </form>`);
  document.getElementById('inventoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      name: f.get('name'), category: f.get('category'), sku: f.get('sku'),
      unit: f.get('unit'), reorder_level: Number(f.get('reorder_level')) || 0,
      cost_price: Number(f.get('cost_price')) || 0, note: f.get('note'),
    };
    try {
      if (i.id) {
        await api('/api/admin/inventory/' + i.id, { method: 'PUT', body });
      } else {
        body.quantity = Number(f.get('quantity')) || 0;
        await api('/api/admin/inventory', { method: 'POST', body });
      }
      toast(i.id ? 'Item updated' : 'Item added');
      closeModal();
      loadInventory(); loadInventoryTx();
    } catch (err) { toast(err.message, true); }
  });
}

function openTransactModal(id) {
  const i = inventoryCache.find(x => x.id === id) || {};
  showModal('Stock Movement — ' + (i.name || 'Item'), `
    <form id="transactForm">
      <div class="form-grid">
        <div class="field span-2"><label>Item</label>
          <select name="item_id">
            ${inventoryCache.map(x => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.name)} (${x.quantity} ${esc(x.unit || 'pcs')})</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Type</label>
          <select name="type">
            <option value="in">Stock In (Received)</option>
            <option value="out">Stock Out (Issued)</option>
            <option value="adjust">Adjust (Set Count)</option>
          </select>
        </div>
        <div class="field"><label>Quantity</label><input type="number" name="change" min="1" step="1" required placeholder="e.g. 10"></div>
        <div class="field span-2"><label>Note</label><input type="text" name="note" placeholder="e.g. Weekly replenishment, issued to class"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">RECORD MOVEMENT</button>
      </div>
    </form>`);
  document.getElementById('transactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      item_id: Number(f.get('item_id')),
      type: f.get('type'),
      change: f.get('type') === 'adjust' ? Number(f.get('change')) : (f.get('type') === 'out' ? -Number(f.get('change')) : Number(f.get('change'))),
      note: f.get('note'),
    };
    try {
      await api('/api/admin/inventory/' + body.item_id + '/transact', { method: 'POST', body });
      toast('Stock updated');
      closeModal();
      loadInventory(); loadInventoryTx();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteInventory(id, name) {
  if (!confirm(`Delete inventory item "${name}"?`)) return;
  try {
    await api('/api/admin/inventory/' + id, { method: 'DELETE' });
    toast('Item deleted');
    loadInventory(); loadInventoryTx();
  } catch (err) { toast(err.message, true); }
}

async function loadInventoryTx() {
  try {
    const all = [];
    for (const i of inventoryCache) {
      const tx = await api('/api/admin/inventory/' + i.id + '/transactions');
      all.push(...tx);
    }
    all.sort((a, b) => b.id - a.id);
    document.getElementById('inventoryTxRows').innerHTML = all.length ? all.slice(0, 50).map(t => `
      <tr>
        <td class="muted">${esc(t.created_at || t.timestamp || '')}</td>
        <td><strong>${esc(t.item_name)}</strong></td>
        <td><span class="badge ${t.type === 'in' ? 'badge-green' : t.type === 'out' ? 'badge-red' : 'badge-yellow'}">${esc(t.type)}</span></td>
        <td>${t.type === 'out' ? '-' : '+'}${t.change}</td>
        <td class="muted">${esc(t.note || '—')}</td>
      </tr>`).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">≋</span>No stock movements yet.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

// ---------- Report cards ----------
let cardStudents = [];

async function loadCardStudents(selId) {
  try {
    cardStudents = await api('/api/admin/students');
    document.getElementById(selId).innerHTML = cardStudents.map(s =>
      `<option value="${s.id}">${esc(s.username)} — ${esc(s.name)}</option>`).join('');
  } catch (err) { toast(err.message, true); }
}

async function loadReportCard() {
  const id = document.getElementById('rcStudentSelect').value;
  if (!id) return toast('Select a student first', true);
  try {
    const rc = await api('/api/admin/students/' + id + '/reportcard');
    window._reportcard = rc;
    document.getElementById('reportcardView').innerHTML = renderReportCard(rc);
  } catch (err) { toast(err.message, true); }
}

function renderReportCard(rc) {
  const rows = rc.courses.map(c => `
    <div class="rc-course">
      <div class="rc-course-head"><span>${esc(c.code)} — ${esc(c.title)} <span class="sheet-muted">(${esc(c.instructor || '—')})</span></span>
        <span class="rc-grade">GRADE ${esc(c.grade || '—')} · ${esc(c.remark)}</span></div>
      <table>
        <tr><th>Exam</th><th>Date</th><th>Max Marks</th><th>Marks</th><th>%</th></tr>
        ${c.exams.map(e => `<tr><td>${esc(e.title)}</td><td>${esc(e.exam_date || '—')}</td><td>${e.max_marks}</td><td>${e.marks != null ? e.marks : '—'}</td><td>${e.marks != null ? e.pct + '%' : '—'}</td></tr>`).join('')}
        <tr><td colspan="5" class="sheet-muted">Attendance: ${c.attendance.present}/${c.attendance.total} (${c.attendance.pct != null ? c.attendance.pct + '%' : '—'}) &nbsp;·&nbsp; Assignments: ${c.assignments.filter(a => a.score != null).length}/${c.assignments.length} submitted</td></tr>
      </table>
    </div>`).join('');
  return `
    <div class="print-sheet">
      <div class="sheet-head">
        <div class="sheet-brand">VUMCA <span class="sheet-accent">hITECH</span> COMPUTING</div>
        <div class="sheet-org">Learning Management System · ${esc(rc.student.branch_name || '')}</div>
        <div class="sheet-rule"></div>
        <div class="sheet-doctitle">STUDENT REPORT CARD</div>
        <div class="sheet-docno">Generated on ${esc(rc.generated_on)} · ID ${esc(rc.student.username)}</div>
      </div>
      <div class="rc-student">
        <h2>${esc(rc.student.name)}</h2>
        <span class="sheet-muted">${esc(rc.student.mobile || '')}</span>
      </div>
      <div class="rc-wrap">${rows}</div>
      <div class="rc-overall">
        <span>OVERALL: ${rc.overall ? rc.overall.pct + '%' : '—'}</span>
        <span>GRADE: ${rc.overall ? rc.overall.grade : '—'}</span>
        <span>REMARK: ${rc.overall ? (rc.overall.pct >= 75 ? 'EXCELLENT' : rc.overall.pct >= 60 ? 'GOOD' : rc.overall.pct >= 45 ? 'SATISFACTORY' : 'NEEDS IMPROVEMENT') : '—'}</span>
      </div>
      <div class="sheet-foot">
        <div class="sheet-sign">Class Teacher</div>
        <div class="sheet-sign">Principal</div>
        <div class="sheet-note">VUMCA hITECH Computing<br>This is a system-generated report card.</div>
      </div>
    </div>`;
}

function printReportCard() {
  if (!window._reportcard) return toast('Load a report card first', true);
  window.print();
}

// ---------- ID cards ----------
async function loadIdCard() {
  const id = document.getElementById('idcStudentSelect').value;
  if (!id) return toast('Select a student first', true);
  try {
    const ic = await api('/api/admin/students/' + id + '/idcard');
    window._idcard = ic;
    document.getElementById('idcardView').innerHTML = renderIdCard(ic);
  } catch (err) { toast(err.message, true); }
}

function renderIdCard(ic) {
  return `
    <div class="print-sheet" style="background:transparent;box-shadow:none;padding:0">
      <div class="sheet-head">
        <div class="sheet-brand">VUMCA <span class="sheet-accent">hITECH</span> COMPUTING</div>
        <div class="sheet-org">${esc(ic.student.branch_name || '')}</div>
        <div class="sheet-rule"></div>
        <div class="sheet-doctitle">STUDENT IDENTITY CARD</div>
      </div>
      <div class="id-card">
        <div class="id-top">
          <div class="id-brand">VUMCA <span class="accent">hITECH</span></div>
          <div class="id-photo">${photoHtml(ic.student.photo_data, ic.student.name)}</div>
        </div>
        <div class="id-name">${esc(ic.student.name)}</div>
        <div class="id-row">
          <div class="id-facts">
            <div class="id-fact"><b>Student ID</b> &nbsp;${esc(ic.student.username)}</div>
            <div class="id-fact"><b>Mobile</b> &nbsp;${esc(ic.student.mobile || '—')}</div>
            <div class="id-fact"><b>Branch</b> &nbsp;${esc(ic.student.branch_address || '—')}</div>
            <div class="id-fact"><b>Courses</b> &nbsp;${ic.courses.map(c => c.code).join(', ') || '—'}</div>
          </div>
        </div>
        <div class="id-tag">STUDENT · VALID ${esc(ic.valid_until)}</div>
        <div class="id-foot">
          <span>Issued: ${esc(ic.issued_on)}</span>
          <span>This card is the property of VUMCA hITECH Computing. If found, please return to the institute.</span>
        </div>
      </div>
    </div>`;
}

function printIdCard() {
  if (!window._idcard) return toast('Load an ID card first', true);
  window.print();
}

// ---------- Backup & restore ----------
function clearBackupHint() {
  document.getElementById('backupHint').textContent = '';
}

async function downloadBackup() {
  try {
    const blob = await (await api('/api/admin/backup', { raw: true })).blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vumca-backup-' + todayStr() + '.db';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded');
  } catch (err) { toast(err.message, true); }
}

async function restoreBackup() {
  const file = document.getElementById('restoreFile').files[0];
  if (!file) return toast('Choose a backup .db file first', true);
  if (!confirm('Restore will REPLACE all current data with the backup. A snapshot of the current database is taken first. Continue?')) return;
  try {
    const data = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(data)));
    const res = await api('/api/admin/restore', { method: 'POST', body: { data: b64 } });
    document.getElementById('backupHint').innerHTML = `<span style="color:var(--green)">Restore successful. The database was replaced with the backup.</span>`;
    toast('Database restored');
  } catch (err) {
    document.getElementById('backupHint').innerHTML = `<span style="color:var(--red)">${esc(err.message)}</span>`;
    toast('Restore failed', true);
  }
}

// ---------- Enquiry conversion ----------
async function convertEnquiry(id, name) {
  if (!confirm(`Convert enquiry from "${name}" into a student? A login will be created and the enquiry marked as Enrolled.`)) return;
  try {
    const res = await api('/api/admin/enquiries/' + id + '/convert', { method: 'POST' });
    toast(`Converted! Login: ${res.username} / ${res.password}`);
    loadEnquiries();
    loadCardStudents('rcStudentSelect');
    loadCardStudents('idcStudentSelect');
  } catch (err) { toast(err.message, true); }
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

// ---------- Library ----------
async function loadBooks() {
  const books = await api('/api/admin/books');
  window._books = books;
  document.getElementById('bookRows').innerHTML = books.length ? books.map(b => `
    <tr>
      <td><strong>${esc(b.title)}</strong></td>
      <td class="muted">${esc(b.author || '—')}</td>
      <td class="muted">${esc(b.isbn || '—')}</td>
      <td><span class="badge badge-purple">${esc(b.category || 'General')}</span></td>
      <td>${b.quantity}</td>
      <td><span class="badge ${b.available > 0 ? 'badge-green' : 'badge-red'}">${b.available}</span></td>
      <td>${b.issued_count}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="openBookModal(${b.id})">EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBook(${b.id}, '${esc(b.title)}')">DEL</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="8"><div class="empty-state"><span class="es-icon">▤</span>No books in the catalog yet.</div></td></tr>';
}

function openBookModal(id) {
  const b = (window._books || []).find(x => x.id === id) || {};
  showModal(b.id ? 'Edit Book' : 'Add Book', `
    <form id="bookForm">
      <div class="form-grid">
        <div class="field span-2"><label>Title *</label><input name="title" required value="${esc(b.title || '')}" placeholder="e.g. Python Crash Course"></div>
        <div class="field"><label>Author</label><input name="author" value="${esc(b.author || '')}" placeholder="e.g. Eric Matthes"></div>
        <div class="field"><label>ISBN</label><input name="isbn" value="${esc(b.isbn || '')}"></div>
        <div class="field"><label>Category</label>
          <select name="category">
            ${['Programming', 'Web Development', 'AI / ML', 'Databases', 'Networking', 'Computer Science', 'General'].map(c =>
              `<option value="${c}" ${(b.category || 'General') === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Copies</label><input type="number" name="quantity" min="1" value="${b.quantity || 1}"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${b.id ? 'SAVE CHANGES' : 'ADD BOOK'}</button>
      </div>
    </form>
  `);
  document.getElementById('bookForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const body = { title: f.get('title'), author: f.get('author'), isbn: f.get('isbn'), category: f.get('category'), quantity: Number(f.get('quantity')) };
    try {
      if (b.id) await api('/api/admin/books/' + b.id, { method: 'PUT', body });
      else await api('/api/admin/books', { method: 'POST', body });
      toast(b.id ? 'Book updated' : 'Book added');
      closeModal(); loadBooks();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteBook(id, title) {
  if (!confirm(`Delete "${title}" from the catalog?`)) return;
  try {
    await api('/api/admin/books/' + id, { method: 'DELETE' });
    toast('Book deleted'); loadBooks();
  } catch (err) { toast(err.message, true); }
}

async function loadLoans() {
  const loans = await api('/api/admin/library/loans');
  document.getElementById('loanRows').innerHTML = loans.length ? loans.map(l => `
    <tr>
      <td><strong>${esc(l.book_title)}</strong></td>
      <td>${esc(l.student_name)} <span class="muted">(${esc(l.username)})</span></td>
      <td class="muted">${esc(l.issue_date || '')}</td>
      <td class="muted">${esc(l.due_date || '')}</td>
      <td><span class="badge ${l.status === 'issued' ? 'badge-yellow' : 'badge-green'}">${esc(l.status)}</span></td>
      <td>${l.fine ? fmtMoney(l.fine) : '—'}</td>
      <td class="muted">${esc(l.return_date || '—')}</td>
      <td class="table-actions">
        ${l.status === 'issued'
          ? `<button class="btn btn-ghost btn-sm" onclick="returnLoan(${l.id}, '${esc(l.book_title)}')">RETURN</button>`
          : '<span class="muted">—</span>'}
      </td>
    </tr>
  `).join('') : '<tr><td colspan="8"><div class="empty-state"><span class="es-icon">▤</span>No loans yet.</div></td></tr>';
}

function openLoanModal() {
  (async () => {
    if (!window._students || !window._students.length) window._students = await api('/api/admin/students');
    const available = (window._books || []).filter(b => b.available > 0);
    if (!available.length) return toast('No books available to issue (add books or wait for returns)', true);
    showModal('Issue Book', `
      <form id="loanForm">
        <div class="form-grid">
          <div class="field"><label>Book *</label>
            <select name="book_id" required>
              <option value="">Select book...</option>
              ${available.map(b => `<option value="${b.id}">${esc(b.title)} (${b.available} available)</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Student *</label>
            <select name="student_id" required>
              <option value="">Select student...</option>
              ${window._students.map(s => `<option value="${s.id}">${esc(s.name)} (${esc(s.username)})</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Due Date</label><input type="date" name="due_date" value="${todayStr()}"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
          <button type="submit" class="btn btn-purple">ISSUE BOOK</button>
        </div>
      </form>
    `);
    document.getElementById('loanForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const body = { book_id: Number(f.get('book_id')), student_id: Number(f.get('student_id')), due_date: f.get('due_date') || undefined };
      try {
        await api('/api/admin/library/loans', { method: 'POST', body });
        toast('Book issued'); closeModal(); loadLoans(); loadBooks();
      } catch (err) { toast(err.message, true); }
    });
  })();
}

async function returnLoan(id, title) {
  if (!confirm(`Mark "${title}" as returned? An overdue fine may apply.`)) return;
  try {
    const r = await api('/api/admin/library/loans/' + id + '/return', { method: 'POST' });
    toast(r.fine ? `Returned — fine Rs. ${fmtMoney(r.fine)}` : 'Book returned');
    loadLoans(); loadBooks();
  } catch (err) { toast(err.message, true); }
}

// ---------- Transport ----------
async function loadRoutes() {
  const routes = await api('/api/admin/routes');
  window._routes = routes;
  document.getElementById('routeRows').innerHTML = routes.length ? routes.map(r => `
    <tr>
      <td><strong>${esc(r.name)}</strong></td>
      <td class="muted">${esc(r.vehicle_no || '—')}</td>
      <td>${esc(r.driver_name || '—')} ${r.driver_phone ? `<br><span class="muted">${esc(r.driver_phone)}</span>` : ''}</td>
      <td>${fmtMoney(r.fee_monthly)}</td>
      <td><span class="badge badge-cyan">${r.student_count}</span></td>
      <td><span class="badge ${r.status === 'active' ? 'badge-green' : 'badge-red'}">${esc(r.status)}</span></td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="openRouteModal(${r.id})">EDIT</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRoute(${r.id}, '${esc(r.name)}')">DEL</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">⧉</span>No routes configured.</div></td></tr>';
}

function openRouteModal(id) {
  const r = (window._routes || []).find(x => x.id === id) || {};
  showModal(r.id ? 'Edit Route' : 'Add Route', `
    <form id="routeForm">
      <div class="form-grid">
        <div class="field span-2"><label>Route Name *</label><input name="name" required value="${esc(r.name || '')}" placeholder="e.g. Route 1 - Sector 7"></div>
        <div class="field"><label>Vehicle No</label><input name="vehicle_no" value="${esc(r.vehicle_no || '')}" placeholder="MH-01-AB-1234"></div>
        <div class="field"><label>Monthly Fee (Rs.)</label><input type="number" name="fee_monthly" min="0" value="${r.fee_monthly || ''}"></div>
        <div class="field"><label>Driver Name</label><input name="driver_name" value="${esc(r.driver_name || '')}"></div>
        <div class="field"><label>Driver Phone</label><input name="driver_phone" value="${esc(r.driver_phone || '')}"></div>
        <div class="field"><label>Status</label>
          <select name="status">
            <option value="active" ${r.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${r.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">${r.id ? 'SAVE CHANGES' : 'ADD ROUTE'}</button>
      </div>
    </form>
  `);
  document.getElementById('routeForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const body = {
      name: f.get('name'), vehicle_no: f.get('vehicle_no'), driver_name: f.get('driver_name'),
      driver_phone: f.get('driver_phone'), fee_monthly: Number(f.get('fee_monthly')) || 0, status: f.get('status'),
    };
    try {
      if (r.id) await api('/api/admin/routes/' + r.id, { method: 'PUT', body });
      else await api('/api/admin/routes', { method: 'POST', body });
      toast(r.id ? 'Route updated' : 'Route added');
      closeModal(); loadRoutes(); loadRouteSelect();
    } catch (err) { toast(err.message, true); }
  });
}

async function deleteRoute(id, name) {
  if (!confirm(`Delete route "${name}" and its student assignments?`)) return;
  try {
    await api('/api/admin/routes/' + id, { method: 'DELETE' });
    toast('Route deleted'); loadRoutes(); loadRouteSelect();
  } catch (err) { toast(err.message, true); }
}

async function loadRouteSelect() {
  try {
    const routes = await api('/api/admin/routes');
    window._routes = routes;
    const sel = document.getElementById('routeSelect');
    sel.innerHTML = routes.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    if (routes.length) loadRouteStudents();
  } catch (_) {}
}

async function loadRouteStudents() {
  const routeId = Number(document.getElementById('routeSelect').value);
  if (!routeId) return;
  const students = await api('/api/admin/routes/' + routeId + '/students');
  document.getElementById('routeStudentRows').innerHTML = students.length ? students.map(s => `
    <tr>
      <td><strong>${esc(s.student_name)}</strong> <span class="muted">(${esc(s.username)})</span></td>
      <td class="muted">${esc(s.mobile || '—')}</td>
      <td>${esc(s.stop_name || '—')}</td>
      <td class="muted">${esc(s.boarding_time || '—')}</td>
      <td class="table-actions">
        <button class="btn btn-danger btn-sm" onclick="removeRouteStudent(${s.student_id})">REMOVE</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">⧉</span>No students on this route.</div></td></tr>';
}

async function openRouteStudentModal() {
  if (!window._students || !window._students.length) window._students = await api('/api/admin/students');
  const routeId = Number(document.getElementById('routeSelect').value);
  showModal('Assign Student to Route', `
    <form id="routeStudentForm">
      <div class="form-grid">
        <div class="field"><label>Student *</label>
          <select name="student_id" required>
            <option value="">Select student...</option>
            ${window._students.map(s => `<option value="${s.id}">${esc(s.name)} (${esc(s.username)})</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Stop / Pickup Point</label><input name="stop_name" placeholder="e.g. Sector 7 Stop 4"></div>
        <div class="field"><label>Boarding Time</label><input type="time" name="boarding_time" value="08:00"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">ASSIGN</button>
      </div>
    </form>
  `);
  document.getElementById('routeStudentForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const body = { student_id: Number(f.get('student_id')), stop_name: f.get('stop_name'), boarding_time: f.get('boarding_time') };
    try {
      await api('/api/admin/routes/' + routeId + '/students', { method: 'POST', body });
      toast('Student assigned'); closeModal(); loadRouteStudents();
    } catch (err) { toast(err.message, true); }
  });
}

async function removeRouteStudent(studentId) {
  const routeId = Number(document.getElementById('routeSelect').value);
  if (!confirm('Remove this student from the route?')) return;
  try {
    await api('/api/admin/routes/' + routeId + '/students/' + studentId, { method: 'DELETE' });
    toast('Student removed'); loadRouteStudents();
  } catch (err) { toast(err.message, true); }
}

// ---------- Broadcasts ----------
async function loadBroadcastConfig() {
  try {
    const s = await api('/api/admin/notifications/status');
    const badge = document.getElementById('broadcastCfgBadge');
    badge.textContent = s.email_configured ? 'SMS/WhatsApp + EMAIL READY' : (s.configured ? 'GATEWAY READY' : 'SIMULATED MODE');
    badge.className = 'badge ' + (s.configured || s.email_configured ? 'badge-green' : 'badge-yellow');
  } catch (_) {}
}

async function loadBroadcasts() {
  const list = await api('/api/admin/broadcasts');
  document.getElementById('broadcastRows').innerHTML = list.length ? list.map(b => `
    <tr>
      <td><strong>${esc(b.title)}</strong></td>
      <td><span class="badge badge-cyan">${esc(b.channel)}</span></td>
      <td class="muted">${esc(b.audience)}</td>
      <td>${b.recipient_count}</td>
      <td><span class="badge badge-green">${b.sent}</span></td>
      <td><span class="badge badge-red">${b.failed}</span></td>
      <td class="muted">${esc((b.created_at || '').slice(0, 16))}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="viewBroadcastRecipients(${b.id})">VIEW LOG</button></td>
    </tr>
  `).join('') : '<tr><td colspan="8"><div class="empty-state"><span class="es-icon">✉</span>No broadcasts sent yet.</div></td></tr>';
  document.getElementById('broadcastRecipientsView').innerHTML = '';
}

function toggleBroadcastAudience() {
  const hint = document.getElementById('broadcastHint');
  if (hint) hint.innerHTML = '';
}

async function sendBroadcast() {
  const message = document.getElementById('broadcastMessage').value.trim();
  if (!message) return toast('Enter a message first', true);
  const body = {
    title: document.getElementById('broadcastTitle').value.trim() || 'Broadcast',
    message,
    channel: document.getElementById('broadcastChannel').value,
    audience: document.getElementById('broadcastAudience').value,
  };
  if (!confirm('Send this broadcast now to the selected audience?')) return;
  try {
    const hint = document.getElementById('broadcastHint');
    hint.innerHTML = '<span style="color:var(--cyan)">Sending... this may take a moment.</span>';
    const r = await api('/api/admin/broadcasts', { method: 'POST', body });
    hint.innerHTML = `<span style="color:var(--green)">Sent to ${r.sent} of ${r.recipient_count} recipients (${r.failed} failed).</span>`;
    toast('Broadcast sent');
    loadBroadcasts();
  } catch (err) {
    document.getElementById('broadcastHint').innerHTML = `<span style="color:var(--red)">${esc(err.message)}</span>`;
    toast('Broadcast failed', true);
  }
}

async function viewBroadcastRecipients(id) {
  const rec = await api('/api/admin/broadcasts/' + id + '/recipients');
  document.getElementById('broadcastRecipientsView').innerHTML = `
    <div class="panel">
      <div class="panel-header"><h2>Recipient Log</h2>
        <button class="btn btn-ghost btn-small" onclick="document.getElementById('broadcastRecipientsView').innerHTML=''">CLOSE</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Student</th><th>Contact</th><th>Status</th><th>Sent</th></tr></thead>
          <tbody>
            ${rec.map(r => `
              <tr>
                <td><strong>${esc(r.name)}</strong> <span class="muted">(${esc(r.username)})</span></td>
                <td class="muted">${esc(r.channel === 'email' ? r.email : r.mobile)}</td>
                <td><span class="badge ${r.status === 'sent' || r.status === 'sent-email' ? 'badge-green' : 'badge-red'}">${esc(r.status)}</span></td>
                <td class="muted">${esc((r.sent_at || '').slice(0, 16))}</td>
              </tr>`).join('') || '<tr><td colspan="4"><div class="empty-state"><span class="es-icon">✉</span>No recipients logged.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ---------- Leave management ----------
async function loadLeaves() {
  const leaves = await api('/api/admin/leaves');
  document.getElementById('leaveRows').innerHTML = leaves.length ? leaves.map(l => `
    <tr>
      <td><strong>${esc(l.employee_name || '—')}</strong><br><span class="muted">${esc(l.employee_type)}</span></td>
      <td><span class="badge badge-purple">${esc(l.leave_type)}</span></td>
      <td class="muted">${esc(l.reason || '—')}</td>
      <td class="muted">${esc(l.start_date)}</td>
      <td class="muted">${esc(l.end_date)}</td>
      <td>${l.days}</td>
      <td><span class="badge ${l.status === 'approved' ? 'badge-green' : l.status === 'rejected' ? 'badge-red' : 'badge-yellow'}">${esc(l.status)}</span></td>
      <td class="muted">${esc((l.applied_on || '').slice(0, 16))}</td>
      <td class="table-actions">
        ${l.status === 'pending'
          ? `<button class="btn btn-ghost btn-sm" onclick="reviewLeave(${l.id}, 'approved')">APPROVE</button>
             <button class="btn btn-danger btn-sm" onclick="reviewLeave(${l.id}, 'rejected')">REJECT</button>`
          : `<span class="muted">${esc(l.reviewed_by || '')}</span>`}
      </td>
    </tr>
  `).join('') : '<tr><td colspan="10"><div class="empty-state"><span class="es-icon">☍</span>No leave requests yet.</div></td></tr>';
}

async function loadLeaveCalendar() {
  const leaves = await api('/api/admin/leaves/calendar');
  document.getElementById('leaveCalendarRows').innerHTML = leaves.length ? leaves.map(l => `
    <tr>
      <td><strong>${esc(l.employee_name || '—')}</strong></td>
      <td class="muted">${esc(l.employee_role || '—')}</td>
      <td class="muted">${esc(l.start_date)}</td>
      <td class="muted">${esc(l.end_date)}</td>
      <td>${l.days}</td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">☍</span>No approved leave.</div></td></tr>';
}

async function reviewLeave(id, status) {
  if (!confirm(`Mark this leave as ${status}?`)) return;
  try {
    await api('/api/admin/leaves/' + id + '/review', { method: 'POST', body: { status } });
    toast('Leave ' + status);
    loadLeaves(); loadLeaveCalendar();
  } catch (err) { toast(err.message, true); }
}

// ---------- CSV import ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (row.some(x => x.trim() !== '')) { row.push(field); rows.push(row); }
  return rows;
}

async function importCsv(kind) {
  const input = document.getElementById(kind === 'stu' ? 'stuCsvFile' : 'enqCsvFile');
  const file = input.files[0];
  if (!file) return toast('Choose a .csv file first', true);
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return toast('CSV must have a header row and at least one data row', true);
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const dataRows = rows.slice(1);
  if (kind === 'stu') {
    const key = (r, ...names) => {
      for (const n of names) { const i = headers.indexOf(n); if (i >= 0 && r[i] !== undefined && r[i].trim() !== '') return r[i].trim(); }
      return '';
    };
    const payload = dataRows.map(r => ({
      username: key(r, 'username', 'student id', 'id'),
      name: key(r, 'name', 'student name', 'full name'),
      email: key(r, 'email'),
      mobile: key(r, 'mobile', 'phone', 'phone number'),
      fee_amount: Number(key(r, 'fee', 'fee amount', 'amount')) || 0,
      fee_paid: key(r, 'fee paid', 'paid') ? key(r, 'fee paid', 'paid') : '',
      fee_installments: Number(key(r, 'installments')) || 1,
      fee_start_date: key(r, 'fee start', 'start date'),
      password: key(r, 'password'),
    }));
    if (!payload.some(p => p.name)) return toast('No valid rows found. Expected columns: name, email, mobile, fee_amount...', true);
    if (!confirm(`Import ${payload.length} student row(s)? Usernames will be auto-generated if missing, and new logins default to password "student123".`)) return;
    try {
      const r = await api('/api/admin/students/import', { method: 'POST', body: { rows: payload } });
      const msg = `Imported ${r.created} students.` + (r.errors.length ? ` ${r.errors.length} skipped.` : '');
      toast(msg); loadStudents();
      input.value = '';
    } catch (err) { toast(err.message, true); }
  } else {
    const key = (r, ...names) => {
      for (const n of names) { const i = headers.indexOf(n); if (i >= 0 && r[i] !== undefined && r[i].trim() !== '') return r[i].trim(); }
      return '';
    };
    const payload = dataRows.map(r => ({
      name: key(r, 'name', 'enquiry name'),
      phone: key(r, 'phone', 'mobile'),
      email: key(r, 'email'),
      course: key(r, 'course', 'course code'),
      source: key(r, 'source'),
      status: key(r, 'status'),
      notes: key(r, 'notes', 'message'),
    }));
    if (!payload.some(p => p.name)) return toast('No valid rows found. Expected columns: name, phone, email, course...', true);
    if (!confirm(`Import ${payload.length} enquiry row(s)?`)) return;
    try {
      const r = await api('/api/admin/enquiries/import', { method: 'POST', body: { rows: payload } });
      const msg = `Imported ${r.created} enquiries.` + (r.errors.length ? ` ${r.errors.length} skipped.` : '');
      toast(msg); loadEnquiries();
      input.value = '';
    } catch (err) { toast(err.message, true); }
  }
}
