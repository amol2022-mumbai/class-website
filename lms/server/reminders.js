// Daily auto fee-reminder scheduler.
// Runs once per day (configurable hour via AUTO_REMINDER_HOUR, default 9am).
// Uses the live Twilio gateway when configured, otherwise records simulated sends.

const db = require('./db');
const notify = require('./notify');
const email = require('./email');
const finance = require('./finance');

let state = {
  lastRun: null,
  nextRun: null,
  enabled: false,
  sent: 0,
  failed: 0,
  skipped: 0,
  log: [],
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Collect installments that are due/overdue and not yet fully paid.
function dueInstallments() {
  const today = todayStr();
  const rows = db
    .prepare(
      `SELECT i.id, i.student_id, i.label, i.amount, i.paid_amount, i.due_date,
              u.name, u.mobile, u.username, u.branch_id,
              (i.amount - i.paid_amount) AS due
         FROM installments i
         JOIN users u ON u.id = i.student_id
        WHERE u.role = 'student' AND i.due_date <= ? AND i.paid_amount < i.amount
        ORDER BY i.due_date ASC`
    )
    .all(today);
  return rows;
}

function schedule() {
  const hour = Number(process.env.AUTO_REMINDER_HOUR || 9);
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  state.nextRun = next.toISOString();
  state.enabled = true;
  clearTimeout(schedule.timer);
  schedule.timer = setTimeout(() => {
    run()
      .catch(() => {})
      .finally(schedule);
  }, next - Date.now());
}

// Send reminders for every due/overdue installment that hasn't been reminded today.
async function run() {
  const started = new Date();
  state.lastRun = started.toISOString();
  state.sent = 0;
  state.failed = 0;
  state.skipped = 0;
  state.log = [];

  const today = todayStr();
  const due = dueInstallments();
  const reminded = db.prepare('SELECT install_id FROM reminders WHERE sent_on = ?').all(today);

  // Installments already reminded today for this student.
  const already = new Set(reminded.map(r => `${r.install_id}`));

  for (const row of due) {
    const key = `${row.id}`;
    const stamp = row.last_reminder_at ? String(row.last_reminder_at).slice(0, 10) : '';
    if (stamp === today || already.has(key)) {
      state.skipped += 1;
      continue;
    }

    const snapshot = finance.feeSnapshot(row.student_id);
    const pending = (snapshot && snapshot.pending) || row.due;
    const nextDue = (snapshot && snapshot.next_due && snapshot.next_due.due_date) || row.due_date;
    const days = Math.max(0, Math.round((new Date(today) - new Date(row.due_date)) / 86400000));

    const dueText =
      days === 0
        ? 'is due today'
        : days > 0
          ? `is overdue by ${days} day${days > 1 ? 's' : ''}`
          : `is due soon`;

    const message =
      `Dear ${row.name}, this is a reminder that your installment "${row.label || 'Fee'}" ` +
      `(Rs. ${finance.inr(row.due)}) ${dueText}. ` +
      `Total pending: Rs. ${finance.inr(pending)}. ` +
      `Please clear your dues by ${nextDue}. - VUMCA Classes`;

    const res = await notify.sendReminder({
      to: row.mobile,
      channel: 'whatsapp',
      message,
    });

    // Email fallback: if WhatsApp can't be delivered (no/odd number, gateway
    // error) and the student has an email + SMTP is configured, send by email.
    let channel = 'whatsapp';
    let finalStatus = res.status;
    if (res.status === 'failed' && row.email && email.isConfigured()) {
      const e = await email.sendEmail({ to: row.email, subject: 'Fee Reminder - VUMCA hITECH Computing', text: message });
      if (e.status === 'sent') {
        channel = 'email';
        finalStatus = 'sent-email';
      }
    }

    db.prepare(
      `INSERT INTO reminders (install_id, student_id, due_date, amount, message, channel, status, sent_on, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.id,
      row.student_id,
      row.due_date,
      row.due,
      message,
      channel,
      finalStatus,
      today,
      started.toISOString()
    );

    db.prepare('UPDATE installments SET last_reminder_at = ? WHERE id = ?').run(started.toISOString(), row.id);

    if (finalStatus === 'failed') {
      state.failed += 1;
      state.log.push(`Failed: ${row.username} - ${res.detail}`);
    } else {
      state.sent += 1;
      state.log.push(`${res.simulated ? '[simulated] ' : ''}${row.username} (${row.label}) Rs. ${finance.inr(row.due)} -> ${finalStatus}${channel === 'email' ? ' (email fallback)' : ''}`);
    }
  }

  return {
    lastRun: state.lastRun,
    sent: state.sent,
    failed: state.failed,
    skipped: state.skipped,
    log: state.log,
  };
}

function status() {
  return {
    configured: notify.isConfigured(),
    email_configured: email.isConfigured(),
    enabled: state.enabled,
    lastRun: state.lastRun,
    nextRun: state.nextRun,
    sent: state.sent,
    failed: state.failed,
    skipped: state.skipped,
    log: state.log,
  };
}

module.exports = { run, status, schedule, dueInstallments };
