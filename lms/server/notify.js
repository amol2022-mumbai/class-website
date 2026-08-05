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

// channel: 'sms' | 'whatsapp'
async function sendReminder({ to, channel, message }) {
  if (!isConfigured()) return { status: 'sent', simulated: true };

  const prefix = channel === 'whatsapp' ? 'whatsapp:' : '';
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const body = new URLSearchParams({
    To: `${prefix}${to}`,
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

module.exports = { isConfigured, sendReminder };
