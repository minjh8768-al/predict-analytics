import { verifyToken } from './_auth.js';
import { ethers } from 'ethers';
import { getBossContract } from './_boss.js';
import { getAdminDb } from './_firebaseAdmin.js';

// 가입만으로 지급하는 보상은 일부러 없음 — 가짜 계정을 무한정 만들어 추천인에게
// 공짜로 BOSS를 채굴시킬 수 있어서, 실제 첫 결제가 확인된 경우에만 보상함.
const FIRSTPAY_REWARD = 10;

// Firebase Admin SDK로 서버가 직접 Firestore를 읽고/써서 판단 — 클라이언트가
// referrerWallet이나 "이미 지급함" 플래그를 스스로 조작해 보상을 반복 수령하는
// 것을 막기 위함 (이전 버전은 이 값들을 클라이언트가 그대로 넘겨줬음).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyToken(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });

  try {
    const db = getAdminDb();
    const meRef = db.collection('users').doc(user.localId);
    const meSnap = await meRef.get();
    if (!meSnap.exists) return res.status(404).json({ error: '유저 정보를 찾을 수 없습니다.' });
    const me = meSnap.data();

    if (!me.referredBy) return res.status(400).json({ error: '추천인이 등록되어 있지 않습니다.' });
    if (me.referralFirstPayBonusPaid) return res.json({ success: true, alreadyPaid: true });

    const hasRealPayment = me.plan && me.plan !== 'free' && ((me.totalPaidPayPal || 0) > 0 || (me.totalPaidBoss || 0) > 0);
    if (!hasRealPayment) return res.status(400).json({ error: '실제 결제 내역이 확인되지 않습니다.' });

    const referrerSnap = await db.collection('users').doc(me.referredBy).get();
    if (!referrerSnap.exists) return res.status(404).json({ error: '추천인 정보를 찾을 수 없습니다.' });
    const referrerWallet = referrerSnap.data().bossWallet;
    if (!referrerWallet || !ethers.isAddress(referrerWallet)) {
      return res.status(400).json({ error: '추천인의 지갑이 연결되어 있지 않습니다.' });
    }

    const token = getBossContract();
    const decimals = await token.decimals();
    const tx = await token.mint(referrerWallet, ethers.parseUnits(String(FIRSTPAY_REWARD), decimals));
    await tx.wait();

    await meRef.update({ referralFirstPayBonusPaid: true });

    res.json({ success: true, txHash: tx.hash, amount: FIRSTPAY_REWARD });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
