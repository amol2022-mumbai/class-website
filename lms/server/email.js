// Email notifications via SMTP (nodemailer, pure-JS - no native compilation).
// Configure with your own credentials in the environment (see .env.example).
// When no SMTP is configured the app skips email sends gracefully.

const nodemailer = require('nodemailer');

const config = {
  host: process.env.EMAIL_HOST || '',
  port: Number(process.env.EMAIL_PORT || 587),
  secure: String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true',
  user: process.env.EMAIL_USER || '',
  pass: process.env.EMAIL_PASS || '',
  from: process.env.EMAIL_FROM || '',
};

let transporter = null;

function isConfigured() {
  return Boolean(config.host && config.user && config.from);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }
  return transporter;
}

// Plain text -> simple HTML wrapper so emails look decent in any client.
function htmlify(text) {
  const safe = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.6">${safe}</div>`;
}

async function sendEmail({ to, subject, text }) {
  if (!isConfigured()) return { status: 'failed', detail: 'SMTP not configured (set EMAIL_HOST/EMAIL_USER/EMAIL_FROM in .env)' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to || ''))) {
    return { status: 'failed', detail: `Invalid email address: "${to}"` };
  }
  try {
    await getTransporter().sendMail({
      from: config.from,
      to,
      subject,
      html: htmlify(text),
    });
    return { status: 'sent', simulated: false };
  } catch (e) {
    return { status: 'failed', detail: e.message };
  }
}

module.exports = { isConfigured, sendEmail, getTransporter };
