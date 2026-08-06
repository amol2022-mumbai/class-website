// WhatsApp / SMS reminders via a Twilio-compatible gateway.
// Configure with your own credentials in the environment (see .env.example).
// When no gateway is configured the app still records reminders in the log.

const config = {
  accountSid: process.env.SMS_TWILIO_ACCOUNT_SID || '',
  authToken: process.env.SMS_TWILIO_AUTH_TOKEN || '',
  from: process.env.SMS_TWILIO_FROM || '',
};

function isConfigured() {
  return Boolean(config.accountSid && config.authToken && config.from);
}

// Normalise any stored number to strict E.164 (e.g. "+91 98765 43210" -> "+919876543210").
// Twilio rejects numbers with spaces/dashes and requires a leading + with country code.
function normalizeE164(input) {
  if (!input) return '';
  let s = String(input).trim();
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '');
  s = s.replace(/\D/g, '');
  if (s.length === 11 && s.startsWith('0')) s = s.slice(1); // "09876543210" -> "9876543210"
  if (s.length === 10) s = '91' + s; // assume Indian local number
  return '+' + s;
}

// channel: 'sms' | 'whatsapp'
async function sendReminder({ to, channel, message }) {
  const number = normalizeE164(to);
  if (!/^\+\d{8,15}$/.test(number)) {
    return { status: 'failed', detail: `Invalid mobile number: "${to}"` };
  }
  if (!isConfigured()) return { status: 'sent', simulated: true };

  const prefix = channel === 'whatsapp' ? 'whatsapp:' : '';
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const body = new URLSearchParams({
    To: `${prefix}${number}`,
    From: `${prefix}${config.from}`,
    Body: message,
  });
  const auth = 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: auth },
      body: body.toString(),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { status: 'failed', detail: detail.slice(0, 200) };
    }
    return { status: 'sent', simulated: false };
  } catch (e) {
    return { status: 'failed', detail: e.message };
  }
}

module.exports = { isConfigured, sendReminder, normalizeE164 };
