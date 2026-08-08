// Fee finance helpers: discounts/concessions, installment plans, payment
// allocation and overdue tracking. Centralised so admin, student, parent and
// Razorpay flows all agree on what a student owes.
const db = require('./db');

const todayStr = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Effective fee after any discount/concession applied to the base fee_amount.
function effectiveFee(u) {
  const base = Number(u.fee_amount) || 0;
  if (u.discount_type === 'percent') return round2(base * (1 - (Number(u.discount_value) || 0) / 100));
  if (u.discount_type === 'fixed') return Math.max(0, base - (Number(u.discount_value) || 0));
  return base;
}

function discountAmount(u) {
  return round2((Number(u.fee_amount) || 0) - effectiveFee(u));
}

function discountLabel(u) {
  if (!u.discount_type || u.discount_type === 'none') return null;
  if (u.discount_type === 'percent') return `${Number(u.discount_value) || 0}% concession`;
  return `Rs. ${Number(u.discount_value) || 0} concession`;
}

function getInstallments(studentId) {
  return db.prepare(
    'SELECT * FROM installments WHERE student_id = ? ORDER BY due_date, id'
  ).all(studentId);
}

// Creates the installment schedule for a student the first time it is needed.
// Existing payments are applied against the new schedule so history stays true.
function ensureInstallments(studentId) {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(studentId);
  if (!u) return;
  const n = Number(u.fee_installments) || 1;
  if (n <= 1) return;
  const existing = db.prepare('SELECT COUNT(*) AS c FROM installments WHERE student_id = ?').get(studentId).c;
  if (existing > 0) return;

  const total = effectiveFee(u);
  const per = round2(total / n);
  const start = new Date(u.fee_start_date || todayStr() + 'T00:00:00');
  const insert = db.prepare(
    'INSERT INTO installments (student_id, label, amount, due_date) VALUES (?, ?, ?, ?)'
  );
  for (let i = 0; i < n; i++) {
    const amt = i === n - 1 ? round2(total - per * (n - 1)) : per;
    const due = new Date(start);
    due.setMonth(due.getMonth() + i);
    insert.run(studentId, i === 0 ? 'Admission Fee' : `Installment ${i + 1}`, amt, due.toISOString().slice(0, 10));
  }
  // Apply payments already recorded so the schedule reflects real money.
  const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE student_id = ?').get(studentId).t;
  if (paid > 0) allocatePayment(studentId, paid);
}

// Applies a payment across unpaid installments in due-date order.
function allocatePayment(studentId, amount) {
  let remaining = round2(amount);
  if (remaining <= 0) return;
  const rows = getInstallments(studentId).filter(i => (Number(i.paid_amount) || 0) < Number(i.amount));
  const now = new Date().toISOString().slice(0, 19);
  for (const i of rows) {
    if (remaining <= 0) break;
    const owed = round2(Number(i.amount) - (Number(i.paid_amount) || 0));
    const pay = Math.min(owed, remaining);
    db.prepare('UPDATE installments SET paid_amount = paid_amount + ? WHERE id = ?').run(pay, i.id);
    remaining = round2(remaining - pay);
  }
  db.prepare('UPDATE installments SET paid_at = ? WHERE paid_amount >= amount AND paid_at IS NULL').run(now);
  refreshFeeStatus(studentId);
}

// Rebuilds installment paid state from scratch based on the real payment ledger.
// Used when a payment is deleted or edited so the schedule stays consistent.
function recomputeInstallments(studentId) {
  db.prepare('UPDATE installments SET paid_amount = 0, paid_at = NULL WHERE student_id = ?').run(studentId);
  const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE student_id = ?').get(studentId).t;
  if (paid > 0) allocatePayment(studentId, paid);
  refreshFeeStatus(studentId);
}

// Total outstanding: from installments when a plan exists, otherwise the plain
// effective-fee minus payments model.
function pendingAmount(studentId) {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(studentId);
  if (!u) return 0;
  const ins = getInstallments(studentId);
  if (ins.length > 0) {
    return round2(ins.reduce((s, i) => s + (Number(i.amount) - Number(i.paid_amount)), 0));
  }
  const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE student_id = ?').get(studentId).t;
  return Math.max(0, round2(effectiveFee(u) - paid));
}

function totalPaid(studentId) {
  return Number(db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE student_id = ?').get(studentId).t) || 0;
}

function refreshFeeStatus(studentId) {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(studentId);
  if (!u) return;
  const pending = pendingAmount(studentId);
  db.prepare('UPDATE users SET fee_paid = ? WHERE id = ?').run(pending <= 0.005 ? 1 : 0, studentId);
}

// Full fee snapshot used by student/parent dashboards and reminders.
function feeSnapshot(studentId) {
  ensureInstallments(studentId);
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(studentId);
  if (!u) return null;
  const today = todayStr();
  const ins = getInstallments(studentId).map(i => {
    const left = round2(Number(i.amount) - (Number(i.paid_amount) || 0));
    const status = left <= 0 ? 'paid' : (i.due_date && i.due_date < today ? 'overdue' : 'pending');
    return { ...i, amount: round2(i.amount), paid_amount: round2(i.paid_amount || 0), outstanding: left, status };
  });
  const overdue = ins.filter(i => i.status === 'overdue');
  const next = ins.find(i => i.status !== 'paid');
  return {
    fee_amount: Number(u.fee_amount) || 0,
    effective_fee: effectiveFee(u),
    discount_type: u.discount_type,
    discount_value: u.discount_value,
    discount_amount: discountAmount(u),
    discount_label: discountLabel(u),
    fee_paid: u.fee_paid,
    total_paid: totalPaid(studentId),
    pending: pendingAmount(studentId),
    overdue_count: overdue.length,
    overdue_amount: round2(overdue.reduce((s, i) => s + i.outstanding, 0)),
    next_due: next ? { label: next.label, due_date: next.due_date, amount: next.outstanding } : null,
    installments: ins,
  };
}

module.exports = { effectiveFee, discountAmount, discountLabel, ensureInstallments, allocatePayment, recomputeInstallments, pendingAmount, totalPaid, refreshFeeStatus, feeSnapshot, todayStr };
