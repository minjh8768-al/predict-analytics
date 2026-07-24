import { verifyToken } from './_auth.js';

const PAYPAL_API = 'https://api-m.paypal.com';

async function getAccessToken() {
  const creds = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
  const r = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await r.json();
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await verifyToken(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { orderId, plan } = req.body;
  if (!orderId || !plan) return res.status(400).json({ error: '잘못된 요청입니다.' });

  try {
    const token = await getAccessToken();
    const r = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await r.json();

    if (data.status === 'COMPLETED') {
      res.json({ success: true, plan });
    } else {
      res.status(400).json({ error: '결제 실패', status: data.status });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
