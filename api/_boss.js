import { ethers } from 'ethers';

export const BOSS_TOKEN_ADDRESS = '0x36B1218cAea18F78d25E0fbf1fA4Ce82fE02cd29';
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
