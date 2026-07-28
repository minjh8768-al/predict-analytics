import { verifyToken } from './_auth.js';
import { ethers } from 'ethers';
import { getBossContract } from './_boss.js';

// PayPal 결제가 실제로 승인된 뒤에 프론트엔드가 호출 — 그만큼 BOSS를 mint.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyToken(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });

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
    const tx = await token.mint(walletAddress, ethers.parseUnits(String(amountNum), decimals));
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
}
