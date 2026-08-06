let currentUser = null;
let children = [];
let selectedChildId = null;
let dashCache = null;

const tabTitles = {
  overview: ['// PARENT / OVERVIEW', 'Child Overview'],
  attendance: ['// PARENT / ATTENDANCE', 'Attendance'],
  fees: ['// PARENT / FEES', 'Fees & Payments'],
  results: ['// PARENT / RESULTS', 'Exam Results'],
};

(async function init() {
  currentUser = await requireAuth('parent');
  if (!currentUser) return;
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userId').textContent = '@' + currentUser.username;

  document.getElementById('sideNav').querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  children = await api('/api/parent/children');
  const sel = document.getElementById('childSelect');
  sel.innerHTML = children.map(c =>
    `<option value="${c.id}">${esc(c.name)} (${esc(c.username)})</option>`
  ).join('');
  if (children.length) {
    selectedChildId = children[0].id;
    sel.value = selectedChildId;
  }
  sel.addEventListener('change', () => {
    selectedChildId = Number(sel.value);
    dashCache = null;
    switchTab(document.querySelector('.nav-item.active').dataset.tab);
  });

  if (!children.length) {
    const tag = document.getElementById('pageTag');
    const title = document.getElementById('pageTitle');
    tag.textContent = '// PARENT / NO LINK';
    title.textContent = 'No Children Linked';
    document.querySelector('.main').insertAdjacentHTML('beforeend',
      '<div class="panel" style="margin-top:20px"><div class="empty-state"><span class="es-icon">◉</span>No students are linked to your account yet. Contact the administration.</div></div>');
    return;
  }

  switchTab('overview');
})();

function switchTab(tab) {
  if (!selectedChildId) return;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');

  const [tag, title] = tabTitles[tab];
  document.getElementById('pageTag').textContent = tag;
  document.getElementById('pageTitle').textContent = title;

  if (tab === 'overview') loadOverview();
  else if (tab === 'attendance') loadAttendance();
  else if (tab === 'fees') loadFees();
  else if (tab === 'results') loadResults();
}

async function getDash() {
  if (!dashCache) dashCache = await api(`/api/parent/children/${selectedChildId}/dashboard`);
  return dashCache;
}

async function loadOverview() {
  const d = await getDash();
  const cards = [
    { label: 'Courses', value: d.courses.length, cls: 'purple' },
    { label: 'Present', value: d.attendanceSummary.present, cls: 'green' },
    { label: 'Late', value: d.attendanceSummary.late, cls: 'yellow' },
    { label: 'Absent', value: d.attendanceSummary.absent, cls: 'red' },
    { label: 'Fee Pending', value: fmtMoney(d.fee.pending), cls: d.fee.pending > 0 ? 'red' : 'green' },
  ];
  document.getElementById('statGrid').innerHTML = cards.map(c => `
    <div class="stat-card ${c.cls || ''}">
      <div class="stat-num">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');

  document.getElementById('courseGrid').innerHTML = d.courses.length ? d.courses.map(c => `
    <div class="course-card">
      <div class="cc-top">
        <span class="course-code">${esc(c.code)}</span>
      </div>
      <h3>${esc(c.title)}</h3>
      <p class="muted">Instructor: ${esc(c.instructor || 'TBA')}</p>
    </div>
  `).join('') : '<div class="empty-state"><span class="es-icon">⬡</span>No courses enrolled.</div>';

  document.getElementById('attRecentRows').innerHTML = d.attendance.slice(0, 10).map(a => {
    const cls = a.status === 'present' ? 'green' : a.status === 'late' ? 'yellow' : 'red';
    return `
    <tr>
      <td class="muted">${esc(a.date)}</td>
      <td><span class="badge badge-cyan">${esc(a.course_code)}</span></td>
      <td><span class="badge badge-${cls}">${esc(a.status.toUpperCase())}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="3"><div class="empty-state"><span class="es-icon">✓</span>No attendance records.</div></td></tr>';
}

async function loadAttendance() {
  const d = await getDash();
  document.getElementById('attStatGrid').innerHTML = `
    <div class="stat-card green"><div class="stat-num">${d.attendanceSummary.present}</div><div class="stat-label">Present</div></div>
    <div class="stat-card purple"><div class="stat-num">${d.attendanceSummary.late}</div><div class="stat-label">Late</div></div>
    <div class="stat-card"><div class="stat-num">${d.attendanceSummary.absent}</div><div class="stat-label">Absent</div></div>
    <div class="stat-card"><div class="stat-num">${d.attendanceSummary.total ? Math.round(((d.attendanceSummary.present + d.attendanceSummary.late) / d.attendanceSummary.total) * 100) : 0}%</div><div class="stat-label">Attendance Rate</div></div>
  `;
  document.getElementById('attendanceRows').innerHTML = d.attendance.length ? d.attendance.map(a => {
    const cls = a.status === 'present' ? 'green' : a.status === 'late' ? 'yellow' : 'red';
    return `
    <tr>
      <td class="muted">${esc(a.date)}</td>
      <td><span class="badge badge-cyan">${esc(a.course_code)}</span></td>
      <td><span class="badge badge-${cls}">${esc(a.status.toUpperCase())}</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="3"><div class="empty-state"><span class="es-icon">✓</span>No attendance records.</div></td></tr>';
}

async function loadFees() {
  const d = await getDash();
  const fee = d.fee;
  document.getElementById('feeStatGrid').innerHTML = `
    <div class="stat-card purple"><div class="stat-num">${fmtMoney(fee.fee_amount)}</div><div class="stat-label">Total Fee</div></div>
    <div class="stat-card green"><div class="stat-num">${fmtMoney(fee.total_paid)}</div><div class="stat-label">Paid</div></div>
    <div class="stat-card ${fee.pending > 0 ? 'red' : 'green'}"><div class="stat-num">${fmtMoney(fee.pending)}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-num">${fee.fee_paid ? 'PAID' : 'PENDING'}</div><div class="stat-label">Status</div></div>
  `;
  document.getElementById('paymentRows').innerHTML = d.payments.length ? d.payments.map(p => `
    <tr>
      <td><span class="badge badge-cyan">${esc(p.receipt_no)}</span></td>
      <td class="muted">${esc(p.paid_at || '')}</td>
      <td class="muted">${esc(p.method || '')}</td>
      <td class="muted">${esc(p.note || '—')}</td>
      <td><strong>${fmtMoney(p.amount)}</strong></td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">₿</span>No payments recorded.</div></td></tr>';
}

async function loadResults() {
  const d = await getDash();
  document.getElementById('resultRows').innerHTML = d.examResults.length ? d.examResults.map(r => {
    const pct = r.max_marks ? Math.round((r.marks / r.max_marks) * 100) : 0;
    return `
    <tr>
      <td><strong>${esc(r.title)}</strong></td>
      <td><span class="badge badge-cyan">${esc(r.course_code)}</span></td>
      <td>${r.marks}</td>
      <td>${r.max_marks}</td>
      <td><span class="badge badge-${pct >= 70 ? 'green' : pct >= 50 ? 'yellow' : 'red'}">${pct}%</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="es-icon">▤</span>No exam results published.</div></td></tr>';
}

function fmtMoney(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
