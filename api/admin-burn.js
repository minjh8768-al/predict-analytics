import { verifyToken } from './_auth.js';
import { ethers } from 'ethers';
import { getBossContract } from './_boss.js';

const ADMIN_EMAILS = ['minjh8768@skycamp.co.kr', 'minjh8768@gmail.com'];

// 결제 실수/환불 등으로 이미 mint된 BOSS를 되돌려 뺄 때 사용.
// (PayPal 환불은 이 API가 아니라 PayPal 대시보드에서 별도로 처리해야 함 — 이건 BOSS 잔액만 맞춰줌)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyToken(req);
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return res.status(403).json({ error: '관리자만 사용할 수 있습니다.' });
  }

  const { walletAddress, amount } = req.body;
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: '지갑 주소가 올바르지 않습니다.' });
  }
  const amountNum = Number(amount);
  if (!(amountNum > 0)) {
    return res.status(400).json({ error: '수량을 정확히 입력해주세요.' });
  }

  try {
    const token = getBossContract();
    const decimals = await token.decimals();
    const cost = ethers.parseUnits(String(amountNum), decimals);
    const balance = await token.balanceOf(walletAddress);
    if (balance < cost) return res.status(409).json({ error: '해당 지갑의 BOSS 잔액이 요청한 수량보다 적습니다.' });

    const tx = await token.adminBurn(walletAddress, cost);
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
