import { ethers } from 'ethers';

export const BOSS_TOKEN_ADDRESS = '0xB0F8baF055aEb1bFDE5136c2c3f2a6DD8c395ECf'; // SIGNAL (구 BOSS) 컨트랙트
const RPC_URL = 'https://polygon-bor-rpc.publicnode.com';

const BOSS_ABI = [
  'function mint(address to, uint256 amount) external',
  'function adminBurn(address from, uint256 amount) external',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export function getBossContract() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error('서버에 DEPLOYER_PRIVATE_KEY 환경변수가 설정되어 있지 않습니다.');
  const provider = new ethers.JsonRpcProvider(RPC_URL, 137);
  const wallet = new ethers.Wallet(privateKey, provider);
  return new ethers.Contract(BOSS_TOKEN_ADDRESS, BOSS_ABI, wallet);
}
