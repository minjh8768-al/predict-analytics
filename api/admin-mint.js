import { verifyToken } from './_auth.js';
import { ethers } from 'ethers';

const ADMIN_EMAILS = ['minjh8768@skycamp.co.kr', 'minjh8768@gmail.com'];
const BOSS_TOKEN_ADDRESS = '0x36B1218cAea18F78d25E0fbf1fA4Ce82fE02cd29';
const RPC_URL = 'https://polygon-bor-rpc.publicnode.com';

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

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    return res.status(500).json({ error: '서버에 DEPLOYER_PRIVATE_KEY 환경변수가 설정되어 있지 않습니다.' });
  }

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL, 137);
    const wallet = new ethers.Wallet(privateKey, provider);
    const token = new ethers.Contract(
      BOSS_TOKEN_ADDRESS,
      ['function mint(address to, uint256 amount) external', 'function decimals() view returns (uint8)'],
      wallet
    );
    const decimals = await token.decimals();
    const tx = await token.mint(walletAddress, ethers.parseUnits(String(amountNum), decimals));
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
