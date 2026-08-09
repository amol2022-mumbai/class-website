// Bulk broadcast campaigns (SMS / WhatsApp / Email) to students.
// Sends to the selected audience, logs each recipient in `notifications`, and
// records an aggregate row in `broadcasts` for the admin history panel.

const db = require('./db');
const notify = require('./notify');
const email = require('./email');

// Resolve the recipient list for an audience.
// audience: 'all' | 'branch' | 'due' | 'students'
function resolveAudience({ audience, branch_id, student_ids }) {
  let rows;
  if (audience === 'due') {
    rows = db.prepare(`
      SELECT DISTINCT u.id, u.name, u.email, u.mobile
      FROM installments i JOIN users u ON u.id = i.student_id
      WHERE u.role = 'student' AND i.paid_amount < i.amount AND i.due_date <= date('now')
    `).all();
  } else if (audience === 'students') {
    if (!Array.isArray(student_ids) || student_ids.length === 0) return [];
    rows = db.prepare(`SELECT id, name, email, mobile FROM users WHERE role = 'student' AND id IN (${student_ids.map(() => '?').join(',')})`).all(...student_ids);
  } else if (audience === 'branch' && branch_id) {
    rows = db.prepare('SELECT id, name, email, mobile FROM users WHERE role = \'student\' AND branch_id = ?').all(branch_id);
  } else {
    rows = db.prepare("SELECT id, name, email, mobile FROM users WHERE role = 'student'").all();
  }
  return rows;
}

// Send one campaign. `channel` may be 'whatsapp', 'sms' or 'email'.
async function run({ title, message, channel, audience, branch_id, student_ids, created_by }) {
  const recipients = resolveAudience({ audience, branch_id, student_ids });
  const chan = channel || 'whatsapp';

  const insert = db.prepare(
    `INSERT INTO broadcasts (title, message, channel, audience, recipient_count, sent, failed, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 'running', ?, datetime('now'))`
  );
  const broadcastId = Number(
    insert.run(title || 'Broadcast', message, chan, audience || 'all', recipients.length, created_by || null).lastInsertRowid
  );

  const log = db.prepare(
    `INSERT INTO notifications (student_id, channel, purpose, message, status, sent_at, broadcast_id)
     VALUES (?, ?, 'broadcast', ?, ?, datetime('now'), ?)`
  );

  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    let result;
    if (chan === 'email') {
      result = await email.sendEmail({ to: r.email, subject: title || 'Notice from VUMCA hITECH Computing', text: message });
    } else {
      result = await notify.sendReminder({ to: r.mobile, channel: chan, message });
      // Fallback: if SMS/WhatsApp failed and an email address exists, try email.
      if (result.status === 'failed' && r.email && email.isConfigured()) {
        const e = await email.sendEmail({ to: r.email, subject: title || 'Notice from VUMCA hITECH Computing', text: message });
        result = e.status === 'sent' ? { status: 'sent-email', simulated: e.simulated } : result;
      }
    }
    log.run(r.id, chan === 'email' ? 'email' : chan, message, result.status, broadcastId);
    if (result.status === 'sent' || result.status === 'sent-email') sent += 1;
    else failed += 1;
  }

  db.prepare('UPDATE broadcasts SET sent = ?, failed = ?, status = ? WHERE id = ?')
    .run(sent, failed, 'done', broadcastId);

  return { id: broadcastId, recipient_count: recipients.length, sent, failed };
}

function list() {
  return db.prepare('SELECT * FROM broadcasts ORDER BY id DESC LIMIT 100').all();
}

function recipients(broadcastId) {
  return db.prepare(`
    SELECT n.student_id, n.channel, n.message, n.status, n.sent_at,
           u.name, u.username, u.email, u.mobile
    FROM notifications n JOIN users u ON u.id = n.student_id
    WHERE n.broadcast_id = ?
    ORDER BY n.sent_at
  `).all(broadcastId);
}

module.exports = { run, list, recipients, resolveAudience };
