import { verifyToken } from './_auth.js';
import { FieldValue } from 'firebase-admin/firestore';

// 예측배틀(라운드제 모의투자) — 기존 api/bet.js의 개별 마켓 연속 베팅과는
// 완전히 별개의 경제/데이터 모델. Vercel Hobby 12개 함수 제한이 이미 꽉 차서
// (bet.js가 12/12) 이 파일은 라우트가 아닌 헬퍼로만 존재 — `_` 접두사라
// 함수 개수에 안 잡히고, api/bet.js가 import해서 씀.
//
// 라운드 베팅은 마켓의 "실제 결과 해소"가 아니라 라운드 구간 동안의
// "확률 가격 방향(상승/하락)"에 건다 — 실제 해소는 며칠~몇 주가 걸릴 수 있어
// 라운드제(1시간)와 안 맞기 때문. 가격은 기존 bet.js의 fetchMarketById()가
// 쓰는 것과 같은 Gamma GET /markets/{id}의 outcomePrices를 그대로 재사용.

export const BATTLE_ROUND_DURATION_MS = 60 * 60 * 1000; // 1시간
export const BATTLE_STARTING_BALANCE = 10000;
export const BATTLE_MIN_STAKE = 10;
export const BATTLE_MAX_STAKE = 2000;
const BATTLE_AVOID_REPEAT_COUNT = 5;

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

async function ensureBattleBalance(db, uid) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  if (typeof data.battleBalance === 'number') return { ref, balance: data.battleBalance };
  await ref.set(
    { battleBalance: BATTLE_STARTING_BALANCE, battleBalanceInitAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ref, balance: BATTLE_STARTING_BALANCE };
}

async function pickNextMarket(db) {
  const recentSnap = await db
    .collection('battleRounds')
    .orderBy('startAt', 'desc')
    .limit(BATTLE_AVOID_REPEAT_COUNT)
    .get();
  const recentMarketIds = new Set(recentSnap.docs.map((d) => d.data().marketId));

  const r = await fetch(
    'https://gamma-api.polymarket.com/markets?active=true&limit=60&order=volume&ascending=false',
    { headers: { Accept: 'application/json' } }
  );
  if (!r.ok) throw new Error('마켓 목록을 불러올 수 없습니다.');
  const markets = await r.json();
  if (!Array.isArray(markets) || !markets.length) throw new Error('마켓 목록이 비어있습니다.');

  const eligible = markets.filter((m) => {
    if (recentMarketIds.has(String(m.id))) return false;
    const prices = parseJsonArray(m.outcomePrices).map(Number);
    const p = prices[0];
    if (!(p > 0.02 && p < 0.98)) return false;
    return true;
  });

  return eligible[0] || markets[0];
}

async function generateAiPrediction(question) {
  const key = process.env.GROQ_API_KEY;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: `너는 예측시장 전문 애널리스트야. 다음 마켓의 확률 가격이 앞으로 1시간 동안
상승(up)할지 하락(down)할지 예측하고, 그 예측에 대한 확신도를 1~3(3이 가장 확신)로 매겨줘.

질문: ${question}

반드시 아래 JSON 형식으로만 답해: {"direction":"up"|"down","confidence":1|2|3}`,
          },
        ],
        max_tokens: 60,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(text);
    const direction = parsed.direction === 'down' ? 'down' : 'up';
    const confidence = [1, 2, 3].includes(Number(parsed.confidence)) ? Number(parsed.confidence) : 1;
    return { direction, confidence };
  } catch (e) {
    return { direction: 'up', confidence: 1 };
  }
}

export async function createNextRound(db) {
  const market = await pickNextMarket(db);
  const prices = parseJsonArray(market.outcomePrices).map(Number);
  const startPrice = prices[0];
  const ai = await generateAiPrediction(market.question);
  const now = Date.now();

  const roundRef = db.collection('battleRounds').doc();
  await roundRef.set({
    marketId: String(market.id),
    conditionId: String(market.conditionId || ''),
    question: market.question || '',
    aiDirection: ai.direction,
    aiConfidence: ai.confidence,
    startPrice,
    endPrice: null,
    status: 'open',
    startAt: FieldValue.serverTimestamp(),
    endAt: now + BATTLE_ROUND_DURATION_MS,
    actualDirection: null,
    aiCorrect: null,
  });
  return roundRef.id;
}

export async function settleRound(db, roundId) {
  const roundRef = db.collection('battleRounds').doc(roundId);
  const roundSnap = await roundRef.get();
  if (!roundSnap.exists || roundSnap.data().status !== 'open') return;
  const round = roundSnap.data();

  const market = await fetchMarketById(round.marketId);
  const prices = market ? parseJsonArray(market.outcomePrices).map(Number) : [];
  const endPrice = prices[0];

  let actualDirection = 'flat';
  if (typeof endPrice === 'number' && endPrice > round.startPrice) actualDirection = 'up';
  else if (typeof endPrice === 'number' && endPrice < round.startPrice) actualDirection = 'down';
  const aiCorrect = actualDirection !== 'flat' && actualDirection === round.aiDirection;

  const positionsSnap = await db
    .collection('battlePositions')
    .where('roundId', '==', roundId)
    .where('status', '==', 'open')
    .get();

  const upPositions = [];
  const downPositions = [];
  let upPool = 0;
  let downPool = 0;
  positionsSnap.docs.forEach((d) => {
    const p = d.data();
    if (p.direction === 'up') { upPositions.push({ id: d.id, ...p }); upPool += p.stake; }
    else { downPositions.push({ id: d.id, ...p }); downPool += p.stake; }
  });
  const totalPot = upPool + downPool;

  const isVoid = actualDirection === 'flat' || upPool === 0 || downPool === 0;
  const winningDirection = actualDirection;
  const winningPool = winningDirection === 'up' ? upPool : downPool;

  const batch = db.batch();
  const allPositions = [...upPositions, ...downPositions];
  for (const p of allPositions) {
    const posRef = db.collection('battlePositions').doc(p.id);
    const won = !isVoid && p.direction === winningDirection;
    const payout = isVoid ? p.stake : won ? Math.round((p.stake * (totalPot / winningPool)) * 100) / 100 : 0;
    batch.update(posRef, {
      status: isVoid ? 'void' : won ? 'won' : 'lost',
      payout,
      settledAt: FieldValue.serverTimestamp(),
    });
    if (payout > 0) {
      const userRef = db.collection('users').doc(p.uid);
      batch.set(userRef, { battleBalance: FieldValue.increment(payout) }, { merge: true });
    }
  }
  batch.update(roundRef, {
    status: 'settled',
    endPrice: typeof endPrice === 'number' ? endPrice : round.startPrice,
    actualDirection,
    aiCorrect,
  });
  await batch.commit();
}

async function getCurrentOpenRound(db) {
  const snap = await db
    .collection('battleRounds')
    .where('status', '==', 'open')
    .orderBy('startAt', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function handleBattleAdvance(req, res, db) {
  const openRound = await getCurrentOpenRound(db);
  if (openRound) {
    const endAtMs = typeof openRound.endAt === 'number' ? openRound.endAt : openRound.endAt?.toMillis?.() ?? 0;
    if (Date.now() >= endAtMs) {
      await settleRound(db, openRound.id);
      await createNextRound(db);
    }
  } else {
    await createNextRound(db);
  }
  res.json({ success: true });
}

export async function handleBattleStatus(req, res, db) {
  const round = await getCurrentOpenRound(db);

  let user = null;
  try { user = await verifyToken(req); } catch { user = null; }

  const positionsSnap = round
    ? await db.collection('battlePositions').where('roundId', '==', round.id).get()
    : null;
  let upPool = 0, downPool = 0, myPosition = null;
  if (positionsSnap) {
    positionsSnap.docs.forEach((d) => {
      const p = d.data();
      if (p.direction === 'up') upPool += p.stake; else downPool += p.stake;
      if (user && p.uid === user.localId) myPosition = { id: d.id, ...p };
    });
  }

  const historySnap = await db
    .collection('battleRounds')
    .where('status', '==', 'settled')
    .orderBy('startAt', 'desc')
    .limit(5)
    .get();
  const history = historySnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let battleBalance = null;
  if (user) {
    const { balance } = await ensureBattleBalance(db, user.localId);
    battleBalance = balance;
  }

  res.json({
    success: true,
    round: round ? { ...round, upPool, downPool, myPosition } : null,
    history,
    battleBalance,
  });
}

export async function handleBattlePlace(req, res, db, user) {
  const { roundId, direction, stake } = req.body || {};
  const stakeNum = Number(stake);

  if (!roundId || (direction !== 'up' && direction !== 'down')) {
    return res.status(400).json({ error: '잘못된 요청입니다.' });
  }
  if (!(stakeNum >= BATTLE_MIN_STAKE && stakeNum <= BATTLE_MAX_STAKE)) {
    return res.status(400).json({ error: `베팅 금액은 ${BATTLE_MIN_STAKE}~${BATTLE_MAX_STAKE} 포인트 사이여야 합니다.` });
  }

  const roundRef = db.collection('battleRounds').doc(roundId);
  const roundSnap = await roundRef.get();
  if (!roundSnap.exists || roundSnap.data().status !== 'open') {
    return res.status(409).json({ error: '진행 중인 라운드가 아닙니다.' });
  }
  const round = roundSnap.data();
  const endAtMs = typeof round.endAt === 'number' ? round.endAt : round.endAt?.toMillis?.() ?? 0;
  if (Date.now() >= endAtMs) {
    return res.status(409).json({ error: '라운드가 마감되었습니다.' });
  }

  const existingSnap = await db
    .collection('battlePositions')
    .where('roundId', '==', roundId)
    .where('uid', '==', user.localId)
    .where('status', '==', 'open')
    .get();
  if (!existingSnap.empty) {
    return res.status(409).json({ error: '이번 라운드에는 이미 포지션이 있습니다.' });
  }

  const { ref: userRef } = await ensureBattleBalance(db, user.localId);
  const posRef = db.collection('battlePositions').doc();

  try {
    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(userRef);
      const freshBalance = freshSnap.exists
        ? (freshSnap.data().battleBalance ?? BATTLE_STARTING_BALANCE)
        : BATTLE_STARTING_BALANCE;
      if (freshBalance < stakeNum) throw new Error('INSUFFICIENT_BALANCE');

      tx.set(userRef, { battleBalance: FieldValue.increment(-stakeNum) }, { merge: true });
      tx.set(posRef, {
        uid: user.localId,
        roundId,
        direction,
        stake: stakeNum,
        status: 'open',
        payout: null,
        createdAt: FieldValue.serverTimestamp(),
        settledAt: null,
      });
    });
  } catch (e) {
    if (e.message === 'INSUFFICIENT_BALANCE') {
      return res.status(409).json({ error: '가상 잔액이 부족합니다.' });
    }
    throw e;
  }

  const freshUser = await userRef.get();
  res.json({ success: true, positionId: posRef.id, newBalance: freshUser.data().battleBalance });
}
