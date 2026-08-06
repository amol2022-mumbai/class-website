// Online fee payments via Razorpay (INR).
// Configure with your own credentials in the environment (see .env.example).
// When not configured, "Pay Online" is hidden and payments stay offline.

const crypto = require('crypto');

const config = {
  keyId: process.env.USER_RAZORPAY_KEY_ID || '',
  keySecret: process.env.USER_RAZORPAY_KEY_SECRET || '',
};

function isConfigured() {
  return Boolean(config.keyId && config.keySecret);
}

async function createOrder({ amountInRupees, receipt }) {
  const url = 'https://api.razorpay.com/v1/orders';
  const body = new URLSearchParams({
    amount: String(Math.round(amountInRupees * 100)),
    currency: 'INR',
    receipt: String(receipt).slice(0, 40),
    payment_capture: '1',
  });
  const auth = 'Basic ' + Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: auth },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const msg = data.error ? data.error.description || data.error.reason || data.error.code : 'Razorpay order creation failed';
    throw new Error(String(msg));
  }
  return data;
}

async function getOrder(orderId) {
  const url = `https://api.razorpay.com/v1/orders/${orderId}`;
  const auth = 'Basic ' + Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
  const res = await fetch(url, { headers: { Authorization: auth } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const msg = data.error ? data.error.description || data.error.reason || data.error.code : 'Razorpay order lookup failed';
    throw new Error(String(msg));
  }
  return data;
}

function verifySignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac('sha256', config.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}

module.exports = { isConfigured, createOrder, getOrder, verifySignature, getKeyId: () => config.keyId };
