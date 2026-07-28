import { verifyToken } from './_auth.js';
import { getAdminDb } from './_firebaseAdmin.js';

// "코드로 추천인 찾기"를 서버가 대신 해줌 — 클라이언트가 users 컬렉션을 직접
// 쿼리하게 하면 Firestore 규칙을 풀어야 해서 다른 유저 정보가 다 노출되는데,
// Admin SDK로 서버가 대신 조회하면 규칙은 그대로 두고 결과(성공/실패)만 돌려줄 수 있음.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyToken(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const code = (req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: '코드를 입력해주세요.' });

  try {
    const db = getAdminDb();
    const meRef = db.collection('users').doc(user.localId);
    const meSnap = await meRef.get();
    const me = meSnap.exists ? meSnap.data() : {};

    if (me.referredBy) return res.status(400).json({ error: '이미 추천인이 등록되어 있습니다.' });
    if (me.referralCode === code) return res.status(400).json({ error: '본인 코드는 입력할 수 없습니다.' });

    const q = await db.collection('users').where('referralCode', '==', code).limit(1).get();
    if (q.empty) return res.status(404).json({ error: '존재하지 않는 코드입니다.' });
    const referrerDoc = q.docs[0];
    if (referrerDoc.id === user.localId) return res.status(400).json({ error: '본인 코드는 입력할 수 없습니다.' });

    await meRef.set({ referredBy: referrerDoc.id }, { merge: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
