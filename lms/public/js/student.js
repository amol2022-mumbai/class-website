let currentUser = null;
let activeQuiz = null;

const tabTitles = {
  dashboard: ['// STUDENT / OVERVIEW', 'My Dashboard'],
  courses: ['// STUDENT / COURSES', 'My Courses'],
  syllabus: ['// STUDENT / SYLLABUS', 'Course Syllabus'],
  timetable: ['// STUDENT / TIMETABLE', 'Weekly Timetable'],
  assignments: ['// STUDENT / ASSIGNMENTS', 'Assignments'],
  quizzes: ['// STUDENT / QUIZZES', 'Quizzes'],
  exams: ['// STUDENT / EXAMS', 'Exams & Results'],
  attendance: ['// STUDENT / ATTENDANCE', 'Attendance'],
  grades: ['// STUDENT / GRADES', 'Grades & Results'],
  fees: ['// STUDENT / FEES', 'Fees & Payments'],
  certificates: ['// STUDENT / CERTIFICATES', 'My Certificates'],
  notices: ['// STUDENT / NOTICES', 'Notices & Announcements'],
  library: ['// STUDENT / LIBRARY', 'Library'],
  transport: ['// STUDENT / TRANSPORT', 'Transport'],
  reportcard: ['// STUDENT / REPORT CARD', 'My Report Card'],
  idcard: ['// STUDENT / ID CARD', 'My ID Card'],
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
  else if (tab === 'syllabus') loadStudentSyllabus();
  else if (tab === 'timetable') loadTimetable();
  else if (tab === 'assignments') loadAssignments();
  else if (tab === 'quizzes') loadQuizzes();
  else if (tab === 'exams') loadExams();
  else if (tab === 'attendance') loadAttendance();
  else if (tab === 'grades') loadGrades();
  else if (tab === 'fees') loadFees();
  else if (tab === 'certificates') loadCertificates();
  else if (tab === 'notices') loadStudentNotices();
  else if (tab === 'library') loadLibrary();
  else if (tab === 'transport') loadTransport();
  else if (tab === 'reportcard') loadStudentReportcard();
  else if (tab === 'idcard') loadStudentIdcard();
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

// ---------- Syllabus ----------
async function loadStudentSyllabus() {
  try {
    const rows = await api('/api/student/syllabus');
    const filter = document.getElementById('studentSyllabusFilter');
    const current = Number(filter.value) || 0;
    const courses = [...new Map(rows.map(s => [s.course_id, { id: s.course_id, code: s.course_code, title: s.course_title }])).values()];
    filter.innerHTML = '<option value="">All Courses</option>' + courses.map(c =>
      `<option value="${c.id}">${esc(c.code)} — ${esc(c.title)}</option>`).join('');
    filter.value = current;

    const list = rows.filter(s => !current || s.course_id === current);
    document.getElementById('studentSyllabusRows').innerHTML = list.length ? list.map(s => `
      <tr>
        <td><span class="badge badge-cyan">${esc(s.course_code)}</span><div class="muted">${esc(s.course_title)}</div></td>
        <td><strong>Week ${s.week_no}</strong></td>
        <td><strong>${esc(s.topic)}</strong>${s.description ? `<div class="muted">${esc(s.description)}</div>` : ''}</td>
        <td class="muted">${esc(s.objectives || '—')}</td>
      </tr>`).join('') : '<tr><td colspan="4"><div class="empty-state"><span class="es-icon">▦</span>No syllabus published for your courses yet.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
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
      : x.question_count > 0
        ? '<span class="badge badge-yellow">NOT ATTEMPTED</span>'
        : '<span class="badge badge-yellow">PENDING</span>';
    const paper = x.question_count > 0
      ? (x.marks != null
          ? `<button class="btn btn-ghost btn-sm" onclick="viewExamResult(${x.id})">VIEW RESULT</button> <span class="muted">${x.question_count} Q${x.duration_minutes ? ' · ' + x.duration_minutes + ' min' : ''}</span>`
          : (x.state === 'available'
              ? `<button class="btn btn-purple btn-sm" onclick="startExam(${x.id}, '${esc(x.title)}')">TAKE EXAM</button>`
              : '<span class="muted">—</span>'))
      : '<span class="muted">—</span>';
    const stateBadge = {
      submitted: '<span class="badge badge-green">SUBMITTED</span>',
      scheduled: '<span class="badge badge-yellow">SCHEDULED</span>',
      closed: '<span class="badge badge-red">CLOSED</span>',
      available: '<span class="badge badge-cyan">OPEN</span>',
    }[x.state] || '<span class="badge badge-cyan">OPEN</span>';
    return `
    <tr>
      <td><strong>${esc(x.title)}</strong></td>
      <td><span class="badge badge-cyan">${esc(x.course_code)}</span> <span class="muted">${esc(x.course_title)}</span></td>
      <td class="muted">${esc(x.exam_date || '—')}</td>
      <td>${x.max_marks}</td>
      <td>${paper}</td>
      <td>${resultBadge}</td>
      <td>${stateBadge}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="es-icon">▤</span>No exams scheduled in your courses.</div></td></tr>';
}

let examTimer = null;
let examEndsAt = 0;

async function startExam(id, title) {
  try {
    const paper = await api('/api/student/exams/' + id + '/paper');
    showModal('Exam: ' + title, `
      <div class="alert alert-success" style="margin-bottom:14px">
        <strong>${paper.questions.length} questions</strong> · ${paper.exam.max_marks} marks
        ${paper.exam.duration_minutes ? ` · <span class="badge badge-yellow" id="examTimer">${paper.exam.duration_minutes}:00 left</span>` : ' · no time limit'}
      </div>
      <div id="examQuestions"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="cancelExam()">CANCEL</button>
        <button type="button" class="btn btn-purple" onclick="submitExam(${id})">SUBMIT EXAM</button>
      </div>
    `);
    renderExamPaper(paper.questions);
    if (paper.exam.duration_minutes) {
      examEndsAt = Date.now() + paper.exam.duration_minutes * 60000;
      clearInterval(examTimer);
      examTimer = setInterval(() => {
        const left = examEndsAt - Date.now();
        if (left <= 0) { clearInterval(examTimer); submitExam(id); return; }
        const el = document.getElementById('examTimer');
        const m = Math.floor(left / 60000);
        const s = Math.floor((left % 60000) / 1000);
        if (el) el.textContent = `${m}:${String(s).padStart(2, '0')} left`;
      }, 500);
    }
  } catch (err) { toast(err.message, true); }
}

function renderExamPaper(questions) {
  const wrap = document.getElementById('examQuestions');
  wrap.innerHTML = questions.map((q, qi) => `
    <div class="quiz-question">
      <div class="qq-text">${qi + 1}. ${esc(q.text)} <span class="badge badge-purple" style="margin-left:6px">${q.marks} mark${q.marks !== 1 ? 's' : ''}</span></div>
      <div class="qq-options">
        ${q.options.map((opt, oi) => `
          <label class="qq-option" data-q="${q.id}" data-opt="${oi}">
            <input type="radio" name="eq-${q.id}" value="${oi}" style="accent-color:var(--cyan)">
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

async function submitExam(id) {
  clearInterval(examTimer);
  const answers = {};
  document.querySelectorAll('.quiz-question').forEach(qEl => {
    const checked = qEl.querySelector('input:checked');
    if (checked) answers[checked.name.replace('eq-', '')] = Number(checked.value);
  });
  try {
    const result = await api(`/api/student/exams/${id}/submit`, { method: 'POST', body: { answers } });
    closeModal();
    toast(`Exam submitted — score ${result.score}/${result.total} (${result.percentage}%)`);
    loadExams();
  } catch (err) { toast(err.message, true); }
}

function cancelExam() {
  clearInterval(examTimer);
  closeModal();
}

async function viewExamResult(id) {
  try {
    const d = await api('/api/student/exams/' + id + '/result');
    const r = d.result;
    const pct = r.percentage;
    const grade = pct >= 70 ? 'badge-green' : pct >= 50 ? 'badge-yellow' : 'badge-red';
    const rankLine = r.total_takers > 0
      ? `Rank <strong>#${r.rank}</strong> of ${r.total_takers} students · top ${r.percentile}%`
      : 'First attempt recorded';
    showModal('Result: ' + esc(d.exam.title), `
      <div class="result-hero" style="text-align:center;padding:10px 0 6px">
        <div style="font-size:42px;font-weight:800">${r.marks}<span style="font-size:20px;color:var(--text-dim)">/${r.total}</span></div>
        <div><span class="badge ${grade}" style="font-size:13px">${pct}%</span></div>
        <div class="muted" style="margin-top:6px">${rankLine}</div>
      </div>
      <div class="alert alert-info" style="margin:12px 0">
        ${esc(d.exam.course_title)} — ${d.review.length} questions · ${r.submitted_at ? 'Submitted ' + esc((r.submitted_at || '').slice(0, 10)) : ''}
      </div>
      <div id="resultReview"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-purple" onclick="closeModal()">CLOSE</button>
      </div>
    `);
    const wrap = document.getElementById('resultReview');
    wrap.innerHTML = d.review.map(q => {
      const chosenLabel = q.chosen != null ? `${String.fromCharCode(65 + q.chosen)}. ${esc(q.options[q.chosen] || '')}` : '<em class="muted">Not answered</em>';
      const correctLabel = `${String.fromCharCode(65 + q.correct_index)}. ${esc(q.options[q.correct_index] || '')}`;
      const icon = q.correct ? '&#10003;' : '&#10007;';
      const cls = q.correct ? 'review-correct' : 'review-wrong';
      return `
        <div class="quiz-question ${cls}">
          <div class="qq-text">${icon} Q${q.index}. ${esc(q.text)} <span class="badge badge-purple" style="margin-left:6px">${q.marks} mark${q.marks !== 1 ? 's' : ''}</span> ${q.correct ? '<span class="badge badge-green" style="float:right">CORRECT</span>' : '<span class="badge badge-red" style="float:right">INCORRECT</span>'}</div>
          <div class="qq-options" style="margin-top:6px">
            ${q.options.map((opt, oi) => {
              let tag = '';
              if (oi === q.correct_index) tag = '<span class="badge badge-green" style="margin-left:6px">ANSWER</span>';
              else if (oi === q.chosen) tag = '<span class="badge badge-red" style="margin-left:6px">YOURS</span>';
              return `<div class="qq-option${oi === q.correct_index ? ' review-answer' : (oi === q.chosen ? ' review-chosen' : '')}" style="display:block;width:100%">${String.fromCharCode(65 + oi)}. ${esc(opt)}${tag}</div>`;
            }).join('')}
          </div>
          ${q.chosen != null && !q.correct ? `<div class="muted" style="margin-top:6px">You chose: ${chosenLabel} · Correct: ${correctLabel}</div>` : ''}
        </div>`;
    }).join('');
    wrap.scrollTop = 0;
  } catch (err) { toast(err.message, true); }
}

async function loadFees() {
  const d = await api('/api/student/fees');
  const overdueBanner = d.overdue_count > 0 ? `
    <div class="alert alert-error" style="margin-bottom:14px">
      <strong>${d.overdue_count} installment(s) overdue</strong> — ${fmtMoney(d.overdue_amount)} past due.
      Please clear them at the office or online at the earliest.
    </div>` : '';
  document.getElementById('feeStatGrid').insertAdjacentHTML('beforebegin', overdueBanner);
  document.getElementById('feeStatGrid').innerHTML = `
    <div class="stat-card purple"><div class="stat-num">${fmtMoney(d.effective_fee)}</div><div class="stat-label">Net Fee${d.discount_amount > 0 ? ` <small>(${esc(d.discount_label || 'concession')})</small>` : ''}</div></div>
    <div class="stat-card green"><div class="stat-num">${fmtMoney(d.total_paid)}</div><div class="stat-label">Paid</div></div>
    <div class="stat-card ${d.pending > 0 ? 'red' : 'green'}"><div class="stat-num">${fmtMoney(d.pending)}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-num">${d.fee_paid ? 'PAID' : 'PENDING'}</div><div class="stat-label">Status</div></div>
  `;
  const btn = document.getElementById('payOnlineBtn');
  if (btn) {
    try {
      const cfg = await api('/api/payment/config');
      btn.style.display = (cfg.enabled && d.pending > 0) ? 'inline-flex' : 'none';
      if (cfg.enabled && d.pending > 0) btn.textContent = `PAY ${fmtMoney(d.pending)} ONLINE (UPI/CARD)`;
    } catch (_) { btn.style.display = 'none'; }
  }
  const statusBadge = { paid: 'badge-green', overdue: 'badge-red', pending: 'badge-yellow' };
  document.getElementById('installmentRows').innerHTML = (d.installments && d.installments.length)
    ? d.installments.map(i => `
      <tr>
        <td><strong>${esc(i.label)}</strong></td>
        <td class="muted">${esc(i.due_date || '—')}</td>
        <td>${fmtMoney(i.amount)}</td>
        <td>${fmtMoney(i.paid_amount)}</td>
        <td>${i.outstanding > 0 ? `<strong style="color:var(--red)">${fmtMoney(i.outstanding)}</strong>` : fmtMoney(0)}</td>
        <td><span class="badge ${statusBadge[i.status] || 'badge-yellow'}">${esc(i.status)}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">≋</span>No installment plan — fee is a single payment.</div></td></tr>';
  document.getElementById('paymentRows').innerHTML = d.payments.length ? d.payments.map(p => `
    <tr>
      <td><span class="badge badge-cyan">${esc(p.receipt_no)}</span></td>
      <td class="muted">${esc(p.paid_at || '')}</td>
      <td class="muted">${esc(p.method || '')}</td>
      <td class="muted">${esc(p.note || '—')}</td>
      <td><strong>${fmtMoney(p.amount)}</strong></td>
      <td><button class="btn btn-ghost btn-sm" onclick="viewReceipt(${p.id})">RECEIPT</button></td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">₿</span>No payments recorded. See the office if you have paid.</div></td></tr>';
}

async function viewReceipt(id) {
  try {
    const d = await api('/api/student/payments/' + id + '/receipt');
    const p = d.payment, b = d.branch || {};
    const courses = (d.courses || []).map(c => `${esc(c.code)} — ${esc(c.title)}`).join('<br>') || '<span class="muted">—</span>';
    showModal('Payment Receipt', `
      <div style="text-align:center;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg-elevated)">
        <div style="font-family:var(--font-display);font-size:18px;color:var(--cyan);font-weight:700">VUMCA hITECH Computing</div>
        <div class="muted" style="font-size:12px">${esc(b.name || '')}${b.address ? ' · ' + esc(b.address) : ''}</div>
        <div class="muted" style="font-size:11px;margin-top:6px">${esc(b.gstin ? 'GSTIN: ' + b.gstin : '')}</div>
        <hr style="border-color:var(--border);margin:12px 0">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span class="muted">RECEIPT NO.</span><strong>${esc(p.receipt_no)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span class="muted">STUDENT</span><strong>${esc(p.student_name)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span class="muted">COURSES</span><span style="text-align:right">${courses}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span class="muted">PAID ON</span><strong>${esc(p.paid_at || '')}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span class="muted">METHOD</span><strong>${esc((p.method || '').toUpperCase())}</strong>
        </div>
        <hr style="border-color:var(--border);margin:12px 0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="muted">AMOUNT PAID</span>
          <strong style="font-size:22px;color:var(--green)">${fmtMoney(p.amount)}</strong>
        </div>
      </div>
      <div class="modal-actions" style="margin-top:14px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CLOSE</button>
        <button type="button" class="btn btn-purple" onclick="window.print()">PRINT</button>
      </div>
    `);
  } catch (err) { toast(err.message, true); }
}

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Razorpay checkout'));
    document.body.appendChild(s);
  });
}

async function payOnline(studentId) {
  if (!studentId) return toast('Sign in first', true);
  try {
    const cfg = await api('/api/payment/config');
    if (!cfg.enabled) return toast('Online payments are not enabled yet', true);
    const order = await api('/api/payment/order', { method: 'POST', body: { student_id: studentId } });
    await loadRazorpay();
    const options = {
      key: order.key_id,
      amount: Math.round(order.amount * 100),
      currency: order.currency || 'INR',
      name: 'VUMCA hITECH Computing',
      description: 'Course fee payment',
      order_id: order.order_id,
      prefill: { name: currentUser ? currentUser.name : '', email: currentUser ? currentUser.email : '' },
      theme: { color: '#00e5ff' },
      handler: async (resp) => {
        try {
          const r = await api('/api/payment/verify', { method: 'POST', body: {
            student_id: studentId,
            order_id: resp.razorpay_order_id,
            payment_id: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          }});
          toast(`Payment received! Receipt ${r.receipt_no}`);
          switchTab('fees');
        } catch (err) { toast(err.message, true); }
      },
      modal: { ondismiss: () => toast('Payment window closed') },
    };
    const rzp = new Razorpay(options);
    rzp.on('payment.failed', resp => toast('Payment failed: ' + ((resp.error && resp.error.description) || ''), true));
    rzp.open();
  } catch (err) { toast(err.message, true); }
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
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
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
    const title = `${esc(a.title)}${a.has_attachment ? ' <span class="badge badge-cyan" title="Download attached material">FILE</span>' : ''}`;
    return `
    <tr>
      <td><strong>${title}</strong><div class="muted">${esc(a.description || '')}</div>
        ${a.has_attachment ? `<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="downloadAssignmentFile(${a.id})">DOWNLOAD MATERIAL</button>` : ''}
      </td>
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

async function downloadAssignmentFile(id) {
  try {
    const a = await api('/api/student/assignments/' + id + '/attachment');
    downloadFromB64(a.name, a.data);
  } catch (err) { toast(err.message, true); }
}

function viewSubmission(assignment) {
  showModal(assignment.title + ' — Submission', `
    <p class="muted" style="margin-bottom:14px">Submitted on <strong>${esc(assignment.submitted || '')}</strong></p>
    <div class="field">
      <label>Your Submission</label>
      <textarea rows="6" readonly style="background:var(--bg-elevated)">${esc(assignment.content || '')}</textarea>
    </div>
    ${assignment.my_attachment
      ? `<div class="field">
          <label>Attached File</label>
          <div><button class="btn btn-ghost btn-sm" onclick="downloadMySubmission(${assignment.id}, ${assignment.my_submission_id})">DOWNLOAD ${esc(assignment.attachment_name)}</button></div>
        </div>`
      : ''}
    <div class="alert ${assignment.score != null ? 'alert-success' : ''}" style="margin-bottom:0">
      ${assignment.score != null ? `GRADE: <strong>${assignment.score} / ${assignment.max_score}</strong>` : 'Awaiting grading by your instructor.'}
    </div>
  `);
}

async function downloadMySubmission(assignmentId, submissionId) {
  try {
    const s = await api(`/api/student/submissions/${submissionId}/attachment`);
    downloadFromB64(s.name, s.data);
  } catch (err) { toast(err.message, true); }
}

function submitAssignment(assignment) {
  showModal('Submit — ' + assignment.title, `
    <form id="submitForm">
      <div class="field">
        <label>Your Work</label>
        <textarea name="content" rows="8" placeholder="Paste your solution / write a summary of your submission..."></textarea>
      </div>
      <div class="field">
        <label>Attach a file (optional)</label>
        <input type="file" id="submitFile">
        <span class="muted" style="font-size:11px">PDF, images or documents</span>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">CANCEL</button>
        <button type="submit" class="btn btn-purple">SUBMIT</button>
      </div>
    </form>
  `);
  document.getElementById('submitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileEl = document.getElementById('submitFile');
    fileToBase64(fileEl.files[0], async (file) => {
      try {
        const body = { content: e.target.content.value || '' };
        if (file) { body.attachment_name = file.name; body.attachment_data = file.data; }
        await api(`/api/student/assignments/${assignment.id}/submit`, { method: 'POST', body });
        toast('Assignment submitted');
        closeModal();
        loadAssignments();
      } catch (err) { toast(err.message, true); }
    });
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

// ---------- Notices ----------
async function loadStudentNotices() {
  try {
    const notices = await api('/api/student/notices');
    document.getElementById('studentNotices').innerHTML = notices.length ? notices.map(n => `
      <div class="notice-item">
        <h3>${esc(n.title)}</h3>
        <div class="ni-meta">Published ${esc(n.publish_date || '—')}</div>
        <div class="ni-body">${esc(n.body || '')}</div>
        ${n.has_attachment ? `<div style="margin-top:10px"><button class="btn btn-purple btn-sm" onclick="downloadCircular(${n.id})">DOWNLOAD CIRCULAR (${esc(n.attachment_name || 'PDF')})</button></div>` : ''}
      </div>`).join('') : '<div class="empty-state"><span class="es-icon">⚑</span>No notices right now.</div>';
  } catch (err) { toast(err.message, true); }
}

async function downloadCircular(id) {
  try {
    const n = await api('/api/student/notices/' + id + '/attachment');
    downloadFromB64(n.name, n.data);
  } catch (err) { toast(err.message, true); }
}

// ---------- Library ----------
async function loadLibrary() {
  try {
    const d = await api('/api/student/library');
    const books = d.books || [];
    const loans = d.loans || [];
    document.getElementById('libBookCount').textContent = books.length + ' available';
    document.getElementById('libraryBookGrid').innerHTML = books.length ? books.map(b => `
      <div class="course-card">
        <div class="cc-top">
          <span class="badge badge-cyan">${esc(b.category)}</span>
          <span class="badge badge-green">${b.available} in stock</span>
        </div>
        <h3>${esc(b.title)}</h3>
        <p>${esc(b.author || '—')}</p>
        <div class="course-meta">
          <span class="badge badge-purple">${b.quantity} copies</span>
          <span class="muted">${esc(b.isbn || '—')}</span>
        </div>
      </div>
    `).join('') : '<div class="empty-state" style="grid-column:1/-1"><span class="es-icon">▤</span>No books available in the library right now.</div>';

    document.getElementById('loanRows').innerHTML = loans.length ? loans.map(l => {
      const overdue = l.status === 'issued' && l.due_date < todayStr();
      return `
      <tr>
        <td><strong>${esc(l.book_title)}</strong></td>
        <td class="muted">${esc(l.author || '—')}</td>
        <td class="muted">${esc(l.issue_date || '—')}</td>
        <td class="muted">${esc(l.due_date)}</td>
        <td><span class="badge ${overdue ? 'badge-red' : l.status === 'returned' ? 'badge-green' : 'badge-yellow'}">${overdue ? 'OVERDUE' : esc(l.status.toUpperCase())}</span></td>
        <td>${l.fine ? fmtMoney(l.fine) : '—'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6"><div class="empty-state"><span class="es-icon">▤</span>You have not borrowed any books yet.</div></td></tr>';
  } catch (err) { toast(err.message, true); }
}

// ---------- Transport ----------
async function loadTransport() {
  try {
    const routes = await api('/api/student/transport');
    const monthly = routes.reduce((s, r) => s + Number(r.fee_monthly || 0), 0);
    document.getElementById('transportStatGrid').innerHTML = `
      <div class="stat-card purple"><div class="stat-num">${routes.length}</div><div class="stat-label">Assigned Routes</div></div>
      <div class="stat-card green"><div class="stat-num">Rs. ${monthly.toLocaleString('en-IN')}</div><div class="stat-label">Monthly Fee</div></div>
    `;
    document.getElementById('transportView').innerHTML = routes.length ? routes.map(r => `
      <div class="panel" style="margin-bottom:14px">
        <div class="panel-header">
          <h2>${esc(r.route_name)}</h2>
          <span class="badge badge-green">ACTIVE</span>
        </div>
        <div class="att-grid">
          <div class="att-card">
            <div class="att-name">Vehicle</div>
            <div class="att-meta">${esc(r.vehicle_no || '—')}</div>
          </div>
          <div class="att-card">
            <div class="att-name">Driver</div>
            <div class="att-meta">${esc(r.driver_name || '—')} ${r.driver_phone ? esc(r.driver_phone) : ''}</div>
          </div>
          <div class="att-card">
            <div class="att-name">Boarding Stop</div>
            <div class="att-meta">${esc(r.stop_name || '—')}</div>
          </div>
          <div class="att-card">
            <div class="att-name">Boarding Time</div>
            <div class="att-meta">${esc(r.boarding_time || '—')}</div>
          </div>
          <div class="att-card">
            <div class="att-name">Monthly Fee</div>
            <div class="att-meta">Rs. ${Number(r.fee_monthly || 0).toLocaleString('en-IN')}</div>
          </div>
        </div>
      </div>
    `).join('') : '<div class="empty-state"><span class="es-icon">⧉</span>You are not assigned to any transport route. Contact the office if you need transport.</div>';
  } catch (err) { toast(err.message, true); }
}

// ---------- Report card ----------
async function loadStudentReportcard() {
  try {
    const rc = await api('/api/student/reportcard');
    document.getElementById('studentReportcard').innerHTML = renderStudentReportcard(rc);
  } catch (err) { toast(err.message, true); }
}

function renderStudentReportcard(rc) {
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
      <div class="rc-student"><h2>${esc(rc.student.name)}</h2><span class="sheet-muted">${esc(rc.student.mobile || '')}</span></div>
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

// ---------- ID card ----------
async function loadStudentIdcard() {
  try {
    const ic = await api('/api/student/idcard');
    document.getElementById('studentIdcard').innerHTML = renderStudentIdcard(ic);
  } catch (err) { toast(err.message, true); }
}

function renderStudentIdcard(ic) {
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
          <div class="id-photo">${esc((ic.student.name || ' ')[0] || ' ')}</div>
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
          <span>This card is the property of VUMCA hITECH Computing.</span>
        </div>
      </div>
    </div>`;
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
