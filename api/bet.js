import { verifyToken } from './_auth.js';
import { getAdminDb } from './_firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { handleBattleStatus, handleBattleStartSession, handleBattlePlace, handleBattleNextRound, handleBattleReset } from './_battle.js';

// 모의투자(가상 시드머니 예측 베팅) — place/myBets/settle을 action 파라미터로 합침.
// Vercel Hobby 플랜 서버리스 함수 12개 제한 때문에 (admin-boss.js와 같은 이유,
// 이 파일을 추가하면 정확히 12/12).
//
// 중요: Gamma API의 ?condition_ids=/?conditionIds= 쿼리 필터는 실제로 필터링을
// 하지 않는다(실측 확인 — 엉뚱한 마켓을 돌려줌). 마켓 단건 조회는 반드시
// GET https://gamma-api.polymarket.com/markets/{marketId} (Gamma 내부 숫자 id)
// 경로로만 해야 신뢰할 수 있다.

const STARTING_BALANCE = 10000;
const MIN_STAKE = 10;
const MAX_STAKE = 2000;
const CRON_SECRET = process.env.SETTLE_CRON_SECRET;

async function fetchMarketById(marketId) {
  const r = await fetch(`https://gamma-api.polymarket.com/markets/${marketId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) return null;
  return r.json();
}

function parseJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function ensureBalance(db, uid) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  if (typeof data.virtualBalance === 'number') return { ref, balance: data.virtualBalance };
  await ref.set(
    { virtualBalance: STARTING_BALANCE, virtualBalanceInitAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ref, balance: STARTING_BALANCE };
}

async function handlePlace(req, res, db, user) {
  const { marketId, conditionId, outcomeIndex, stake } = req.body || {};
  const stakeNum = Number(stake);

  if (!marketId || !conditionId || (outcomeIndex !== 0 && outcomeIndex !== 1)) {
    return res.status(400).json({ error: '잘못된 요청입니다.' });
  }
  if (!(stakeNum >= MIN_STAKE && stakeNum <= MAX_STAKE)) {
    return res.status(400).json({ error: `베팅 금액은 ${MIN_STAKE}~${MAX_STAKE} 포인트 사이여야 합니다.` });
  }

  const market = await fetchMarketById(marketId);
  if (!market) return res.status(404).json({ error: '마켓 정보를 불러올 수 없습니다.' });
  if (market.active === false || market.closed) {
    return res.status(409).json({ error: '이미 종료된 마켓입니다.' });
  }

  const outcomePrices = parseJsonArray(market.outcomePrices).map(Number);
  const entryPrice = outcomePrices[outcomeIndex];
  if (!(entryPrice > 0 && entryPrice <= 1)) {
    return res.status(409).json({ error: '가격 정보를 확인할 수 없습니다.' });
  }
  const outcomes = parseJsonArray(market.outcomes);
  const outcomeLabel = outcomes[outcomeIndex] || (outcomeIndex === 0 ? 'Yes' : 'No');

  const { ref: userRef } = await ensureBalance(db, user.localId);
  const betRef = db.collection('virtualBets').doc();

  try {
    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(userRef);
      const freshBalance = freshSnap.exists
        ? (freshSnap.data().virtualBalance ?? STARTING_BALANCE)
        : STARTING_BALANCE;
      if (freshBalance < stakeNum) throw new Error('INSUFFICIENT_BALANCE');

      tx.set(userRef, { virtualBalance: FieldValue.increment(-stakeNum) }, { merge: true });
      tx.set(betRef, {
        uid: user.localId,
        marketId: String(marketId),
        conditionId: String(conditionId),
        marketQuestion: market.question || '',
        outcomeIndex,
        outcomeLabel,
        entryPrice,
        stake: stakeNum,
        potentialPayout: Math.round((stakeNum / entryPrice) * 100) / 100,
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
        settledAt: null,
        settlePrice: null,
        payout: null,
      });
    });
  } catch (e) {
    if (e.message === 'INSUFFICIENT_BALANCE') {
      return res.status(409).json({ error: '가상 잔액이 부족합니다.' });
    }
    throw e;
  }

  const freshUser = await userRef.get();
  res.json({ success: true, betId: betRef.id, entryPrice, newBalance: freshUser.data().virtualBalance });
}

async function handleMyBets(req, res, db, user) {
  const { balance } = await ensureBalance(db, user.localId);
  const q = await db
    .collection('virtualBets')
    .where('uid', '==', user.localId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  const bets = q.docs.map((d) => ({ id: d.id, ...d.data() }));
  res.json({ success: true, balance, bets });
}

async function handleSettle(req, res, db) {
  const secret = req.headers['x-cron-secret'];
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const openSnap = await db.collection('virtualBets').where('status', '==', 'open').get();
  if (openSnap.empty) return res.json({ success: true, settledCount: 0 });

  const byMarket = new Map();
  openSnap.docs.forEach((d) => {
    const data = d.data();
    if (!byMarket.has(data.marketId)) byMarket.set(data.marketId, []);
    byMarket.get(data.marketId).push({ id: d.id, ...data });
  });

  let settledCount = 0;

  for (const [marketId, bets] of byMarket) {
    const market = await fetchMarketById(marketId);
    if (!market) continue;
    if (!(market.closed && market.umaResolutionStatus === 'resolved')) continue;

    const outcomePrices = parseJsonArray(market.outcomePrices).map(Number);
    const winningIndex = outcomePrices.findIndex((p) => p >= 0.99);

    for (const bet of bets) {
      const betRef = db.collection('virtualBets').doc(bet.id);
      const userRef = db.collection('users').doc(bet.uid);

      // winningIndex === -1: 무승부/취소 등으로 50-50에 가깝게 정산된 경우(예: 경기 취소).
      // 승패를 가릴 수 없으므로 베팅을 무효 처리하고 스테이크를 환불한다.
      const isVoid = winningIndex === -1;
      const won = !isVoid && bet.outcomeIndex === winningIndex;
      const payout = isVoid ? bet.stake : won ? bet.potentialPayout : 0;

      await db.runTransaction(async (tx) => {
        tx.update(betRef, {
          status: isVoid ? 'void' : won ? 'won' : 'lost',
          settledAt: FieldValue.serverTimestamp(),
          settlePrice: outcomePrices[bet.outcomeIndex] ?? null,
          payout,
        });
        if (payout > 0) {
          tx.set(userRef, { virtualBalance: FieldValue.increment(payout) }, { merge: true });
        }
      });
      settledCount++;
    }
  }

  res.json({ success: true, settledCount });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  try {
    const db = getAdminDb();

    if (action === 'settle') return await handleSettle(req, res, db);

    // battleStatus는 로그인 없이도 조회 가능(비회원도 예측배틀을 구경할 수 있어야 함) —
    // 토큰이 있으면 verifyToken을 시도해 내 세션/잔액도 같이 얹어주지만, 없거나
    // 실패해도 401로 막지 않고 그냥 공개 정보만 반환한다 (handleBattleStatus 내부에서 처리).
    if (action === 'battleStatus') return await handleBattleStatus(req, res, db);

    const user = await verifyToken(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });

    if (action === 'place') return await handlePlace(req, res, db, user);
    if (action === 'myBets') return await handleMyBets(req, res, db, user);
    if (action === 'battleStartSession') return await handleBattleStartSession(req, res, db, user);
    if (action === 'battlePlace') return await handleBattlePlace(req, res, db, user);
    if (action === 'battleNextRound') return await handleBattleNextRound(req, res, db, user);
    if (action === 'battleReset') return await handleBattleReset(req, res, db, user);

    return res.status(400).json({ error: '잘못된 요청입니다.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
