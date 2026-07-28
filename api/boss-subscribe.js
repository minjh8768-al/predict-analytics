import { verifyToken } from './_auth.js';
import { ethers } from 'ethers';
import { getBossContract } from './_boss.js';

// BOSS로 구독 결제 — 잔액 확인 후 그만큼 burn (서명 없이 운영 지갑이 대신 처리).
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
    const balance = await token.balanceOf(walletAddress);
    const cost = ethers.parseUnits(String(amountNum), decimals);
    if (balance < cost) return res.status(409).json({ error: 'BOSS 잔액이 부족합니다.' });

    const tx = await token.adminBurn(walletAddress, cost);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
}
