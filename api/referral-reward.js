import { verifyToken } from './_auth.js';
import { ethers } from 'ethers';
import { getBossContract } from './_boss.js';

// 고정 지급액 — 클라이언트가 임의 금액을 요청하지 못하도록 서버에서 종류별로 고정.
// signup(가입만으로 지급)은 일부러 없음 — 가짜 계정을 무한정 만들어 추천인에게
// 공짜로 BOSS를 채굴시킬 수 있어서, 실제 첫 결제가 확인된 경우에만 보상함.
const REWARD_AMOUNTS = { firstpay: 50 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyToken(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { referrerWallet, kind } = req.body;
  const amount = REWARD_AMOUNTS[kind];
  if (!amount) return res.status(400).json({ error: '잘못된 요청입니다.' });
  if (!referrerWallet || !ethers.isAddress(referrerWallet)) {
    return res.status(400).json({ error: '추천인 지갑 주소가 올바르지 않습니다.' });
  }

  try {
    const token = getBossContract();
    const decimals = await token.decimals();
    const tx = await token.mint(referrerWallet, ethers.parseUnits(String(amount), decimals));
    await tx.wait();
    res.json({ success: true, txHash: tx.hash, amount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
