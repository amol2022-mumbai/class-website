// Staff attendance + monthly payroll generation.
const db = require('./db');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Number of working days (Mon-Fri) in a YYYY-MM month.
function workingDaysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const day = new Date(y, m - 1, d).getDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function monthAttendance(staffId, month) {
  const rows = db.prepare(
    'SELECT status, COUNT(*) AS c FROM staff_attendance WHERE staff_id = ? AND substr(date,1,7) = ? GROUP BY status'
  ).all(staffId, month);
  const out = { present: 0, 'half-day': 0, absent: 0, leave: 0, total: 0 };
  for (const r of rows) {
    if (out[r.status] != null) out[r.status] += r.c;
    out.total += r.c;
  }
  return out;
}

// Builds payslips for every active staff member of a branch for a month.
// monthly salary -> per-day = salary / working days; daily salary -> per-day = salary.
function generatePayroll(bid, month) {
  const cond = bid ? " AND branch_id = ?" : "";
  const staff = db.prepare(`SELECT * FROM staff WHERE status = 'active'${cond}`).all(...(bid ? [bid] : []));
  const workingDays = workingDaysInMonth(month);
  const insert = db.prepare(`
    INSERT INTO payslips (staff_id, month, working_days, present_days, half_days, absences, salary_type, monthly_salary, gross_pay, net_pay)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(staff_id, month) DO UPDATE SET
      working_days = excluded.working_days, present_days = excluded.present_days,
      half_days = excluded.half_days, absences = excluded.absences,
      salary_type = excluded.salary_type, monthly_salary = excluded.monthly_salary,
      gross_pay = excluded.gross_pay, net_pay = excluded.net_pay, generated_at = datetime('now')
  `);
  const slips = [];
  for (const s of staff) {
    const att = monthAttendance(s.id, month);
    const presentDays = att.present + att['half-day'] * 0.5;
    let gross = 0;
    if (s.salary_type === 'daily') {
      gross = round2((Number(s.salary) || 0) * presentDays);
    } else if (s.salary_type === 'one-time') {
      gross = Number(s.salary) || 0;
    } else {
      const perDay = (Number(s.salary) || 0) / (workingDays || 1);
      gross = round2(perDay * presentDays);
    }
    insert.run(
      s.id, month, workingDays, presentDays, att['half-day'], att.absent,
      s.salary_type, Number(s.salary) || 0, gross, gross
    );
    slips.push({
      id: db.prepare('SELECT id FROM payslips WHERE staff_id = ? AND month = ?').get(s.id, month).id,
      staff_id: s.id, name: s.name, role: s.role, month,
      working_days: workingDays, present_days: presentDays, half_days: att['half-day'], absences: att.absent,
      salary_type: s.salary_type, monthly_salary: Number(s.salary) || 0, gross_pay: gross, net_pay: gross,
    });
  }
  return { workingDays, slips };
}

function payslipsForMonth(bid, month) {
  return db.prepare(`
    SELECT ps.*, s.name, s.role, s.phone
    FROM payslips ps JOIN staff s ON s.id = ps.staff_id
    WHERE ps.month = ? AND ${bid ? 's.branch_id = ?' : '1=1'}
    ORDER BY s.name
  `).all(month, ...(bid ? [bid] : []));
}

module.exports = { workingDaysInMonth, monthAttendance, generatePayroll, payslipsForMonth };
