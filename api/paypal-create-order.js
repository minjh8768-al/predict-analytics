import { verifyToken } from './_auth.js';

const PAYPAL_API = 'https://api-m.paypal.com';
const PLANS = {
  standard: { price: '99.00', name: '스탠다드 플랜' },
  premium:  { price: '199.00', name: '프리미엄 플랜' },
  supporter: { price: '999.00', name: '서포터 플랜' },
};

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

  const { plan } = req.body;
  const planInfo = PLANS[plan];
  if (!planInfo) return res.status(400).json({ error: '잘못된 플랜입니다.' });

  try {
    const token = await getAccessToken();
    if (!token) return res.status(500).json({ error: 'PayPal 인증 실패 — 환경변수를 확인하세요.' });

    const r = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: planInfo.price },
          description: planInfo.name,
          custom_id: `${user.localId}_${plan}`,
        }],
      }),
    });
    const order = await r.json();
    if (!order.id) return res.status(500).json({ error: `PayPal 오류: ${JSON.stringify(order)}` });
    res.json({ orderId: order.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
