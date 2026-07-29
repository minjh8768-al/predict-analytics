import { verifyToken } from './_auth.js';
import { ethers } from 'ethers';
import { getBossContract } from './_boss.js';

// 관리자 전용 BOSS 수동 지급/차감 — 원래 admin-mint.js / admin-burn.js 두 개였는데,
// Vercel Hobby 플랜의 서버리스 함수 12개 제한에 걸려서 action 파라미터로 합침.
const ADMIN_EMAILS = ['minjh8768@skycamp.co.kr', 'minjh8768@gmail.com'];

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

  const { walletAddress, amount, action } = req.body;
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: '지갑 주소가 올바르지 않습니다.' });
  }
  const amountNum = Number(amount);
  if (!(amountNum > 0)) {
    return res.status(400).json({ error: '수량을 정확히 입력해주세요.' });
  }
  if (action !== 'mint' && action !== 'burn') {
    return res.status(400).json({ error: '잘못된 요청입니다.' });
  }

  try {
    const token = getBossContract();
    const decimals = await token.decimals();
    const amountWei = ethers.parseUnits(String(amountNum), decimals);

    if (action === 'burn') {
      const balance = await token.balanceOf(walletAddress);
      if (balance < amountWei) return res.status(409).json({ error: '해당 지갑의 BOSS 잔액이 요청한 수량보다 적습니다.' });
      const tx = await token.adminBurn(walletAddress, amountWei);
      await tx.wait();
      return res.json({ success: true, txHash: tx.hash });
    }

    const tx = await token.mint(walletAddress, amountWei);
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
