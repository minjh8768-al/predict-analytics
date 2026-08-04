import { verifyToken } from './_auth.js';
import { FieldValue } from 'firebase-admin/firestore';

// 예측배틀(라운드제 모의투자) — 기존 api/bet.js의 개별 마켓 연속 베팅과는
// 완전히 별개의 경제(battleBalance)/데이터 모델. Vercel Hobby 12개 함수 제한이
// 이미 꽉 차서(bet.js가 12/12) 이 파일은 라우트가 아닌 헬퍼로만 존재 — `_`
// 접두사라 함수 개수에 안 잡히고, api/bet.js가 import해서 씀.
//
// v2: "라운드"는 더 이상 자체 정산 단위가 아니다 — 주기적으로 새로
// 큐레이션되는 5개 마켓 메뉴일 뿐이고, 베팅 하나하나는 그 마켓이 실제로
// resolve될 때 각자 따로 정산된다(며칠~몇 주 걸릴 수 있음). 그래서
// battlePositions 스키마와 정산 로직은 기존 api/bet.js의 virtualBets/
// handleSettle을 그대로 복제한 것 — 이미 검증된 코드라 재사용.

export const BATTLE_ROUND_REFRESH_MS = 6 * 60 * 60 * 1000; // 6시간마다 5개 메뉴 새로고침
export const BATTLE_PICKS_PER_ROUND = 5;
export const BATTLE_AVOID_REPEAT_ROUNDS = 5;
export const BATTLE_STARTING_BALANCE = 10000;
export const BATTLE_MIN_STAKE = 10;
export const BATTLE_MAX_STAKE = 2000;

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

async function pickMarkets(db, n) {
  const recentSnap = await db
    .collection('battleRounds')
    .orderBy('createdAt', 'desc')
    .limit(BATTLE_AVOID_REPEAT_ROUNDS)
    .get();
  const recentMarketIds = new Set();
  recentSnap.docs.forEach((d) => {
    const picks = d.data().picks || [];
    picks.forEach((p) => recentMarketIds.add(String(p.marketId)));
  });

  const r = await fetch(
    'https://gamma-api.polymarket.com/markets?active=true&limit=60&order=volume&ascending=false',
    { headers: { Accept: 'application/json' } }
  );
  if (!r.ok) throw new Error('마켓 목록을 불러올 수 없습니다.');
  const markets = await r.json();
  if (!Array.isArray(markets) || !markets.length) throw new Error('마켓 목록이 비어있습니다.');

  const strict = markets.filter((m) => {
    if (recentMarketIds.has(String(m.id))) return false;
    const p = parseJsonArray(m.outcomePrices).map(Number)[0];
    return p > 0.02 && p < 0.98;
  });

  const picks = [];
  const usedIds = new Set();
  for (const m of [...strict, ...markets]) {
    if (picks.length >= n) break;
    if (usedIds.has(m.id)) continue;
    usedIds.add(m.id);
    picks.push(m);
  }
  return picks.slice(0, n);
}

async function generateAiPredictions(markets) {
  const key = process.env.GROQ_API_KEY;
  const fallback = markets.map(() => ({ direction: 'up', confidence: 1 }));
  try {
    const list = markets.map((m, i) => `${i + 1}. ${m.question}`).join('\n');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: `너는 예측시장 전문 애널리스트야. 아래 ${markets.length}개 마켓 각각에 대해
확률이 앞으로 상승(up)할지 하락(down)할지 예측하고, 확신도를 1~3(3이 가장 확신)로 매겨줘.

${list}

반드시 아래 JSON 형식으로만, 목록 순서 그대로 ${markets.length}개를 답해:
{"predictions":[{"direction":"up"|"down","confidence":1|2|3}, ...]}`,
          },
        ],
        max_tokens: 400,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(text);
    const preds = Array.isArray(parsed.predictions) ? parsed.predictions : [];
    return markets.map((_, i) => {
      const p = preds[i];
      const direction = p && p.direction === 'down' ? 'down' : 'up';
      const confidence = p && [1, 2, 3].includes(Number(p.confidence)) ? Number(p.confidence) : 1;
      return { direction, confidence };
    });
  } catch (e) {
    return fallback;
  }
}

export async function createNextRound(db) {
  const markets = await pickMarkets(db, BATTLE_PICKS_PER_ROUND);
  const predictions = await generateAiPredictions(markets);

  const picks = markets.map((m, i) => {
    const outcomes = parseJsonArray(m.outcomes);
    const prices = parseJsonArray(m.outcomePrices).map(Number);
    return {
      marketId: String(m.id),
      conditionId: String(m.conditionId || ''),
      question: m.question || '',
      outcomes: [outcomes[0] || 'Yes', outcomes[1] || 'No'],
      entryPrice: prices[0] ?? 0.5,
      aiDirection: predictions[i].direction,
      aiConfidence: predictions[i].confidence,
    };
  });

  const roundRef = db.collection('battleRounds').doc();
  await roundRef.set({ picks, createdAt: FieldValue.serverTimestamp() });
  return { id: roundRef.id, picks, createdAt: Date.now() };
}

async function getCurrentRound(db) {
  const snap = await db.collection('battleRounds').orderBy('createdAt', 'desc').limit(1).get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    const data = doc.data();
    const createdAtMs = data.createdAt?.toMillis?.() ?? 0;
    if (Array.isArray(data.picks) && Date.now() - createdAtMs < BATTLE_ROUND_REFRESH_MS) {
      return { id: doc.id, picks: data.picks, createdAt: createdAtMs };
    }
  }
  return await createNextRound(db);
}

// shipped api/bet.js의 handleSettle과 동일한 로직 — 컬렉션/잔액 필드명만 battle용으로 교체.
export async function settleOpenBattlePositions(db) {
  const openSnap = await db.collection('battlePositions').where('status', '==', 'open').get();
  if (openSnap.empty) return 0;

  const byMarket = new Map();
  openSnap.docs.forEach((d) => {
    const data = d.data();
    if (!byMarket.has(data.marketId)) byMarket.set(data.marketId, []);
    byMarket.get(data.marketId).push({ id: d.id, ...data });
  });

  let settledCount = 0;
  for (const [marketId, positions] of byMarket) {
    const market = await fetchMarketById(marketId);
    if (!market) continue;
    if (!(market.closed && market.umaResolutionStatus === 'resolved')) continue;

    const outcomePrices = parseJsonArray(market.outcomePrices).map(Number);
    const winningIndex = outcomePrices.findIndex((p) => p >= 0.99);

    for (const pos of positions) {
      const posRef = db.collection('battlePositions').doc(pos.id);
      const userRef = db.collection('users').doc(pos.uid);

      const isVoid = winningIndex === -1;
      const won = !isVoid && pos.outcomeIndex === winningIndex;
      const payout = isVoid ? pos.stake : won ? pos.potentialPayout : 0;

      await db.runTransaction(async (tx) => {
        tx.update(posRef, {
          status: isVoid ? 'void' : won ? 'won' : 'lost',
          settledAt: FieldValue.serverTimestamp(),
          settlePrice: outcomePrices[pos.outcomeIndex] ?? null,
          payout,
        });
        if (payout > 0) {
          tx.set(userRef, { battleBalance: FieldValue.increment(payout) }, { merge: true });
        }
      });
      settledCount++;
    }
  }
  return settledCount;
}

export async function handleBattleAdvance(req, res, db) {
  await getCurrentRound(db);
  const settledCount = await settleOpenBattlePositions(db);
  res.json({ success: true, settledCount });
}

export async function handleBattleStatus(req, res, db) {
  const round = await getCurrentRound(db);

  let user = null;
  try { user = await verifyToken(req); } catch { user = null; }

  let myPositionsByMarket = {};
  if (user) {
    const marketIds = round.picks.map((p) => p.marketId);
    const posSnap = await db
      .collection('battlePositions')
      .where('uid', '==', user.localId)
      .where('status', '==', 'open')
      .get();
    posSnap.docs.forEach((d) => {
      const p = d.data();
      if (marketIds.includes(p.marketId)) myPositionsByMarket[p.marketId] = { id: d.id, ...p };
    });
  }

  const picks = round.picks.map((p) => ({ ...p, myPosition: myPositionsByMarket[p.marketId] || null }));

  let openPositions = [];
  let settledPositions = [];
  let battleBalance = null;
  if (user) {
    const { balance } = await ensureBattleBalance(db, user.localId);
    battleBalance = balance;
    const betsSnap = await db
      .collection('battlePositions')
      .where('uid', '==', user.localId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    const allBets = betsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const roundEntryByMarket = new Map(round.picks.map((p) => [p.marketId, p.entryPrice]));

    const openBets = allBets.filter((b) => b.status === 'open');
    settledPositions = allBets.filter((b) => b.status !== 'open').slice(0, 10);

    openPositions = await Promise.all(
      openBets.map(async (b) => {
        let currentPrice = roundEntryByMarket.get(b.marketId);
        if (currentPrice == null) {
          const market = await fetchMarketById(b.marketId);
          const prices = market ? parseJsonArray(market.outcomePrices).map(Number) : [];
          currentPrice = prices[b.outcomeIndex] ?? b.entryPrice;
        } else if (b.outcomeIndex === 1) {
          currentPrice = 1 - currentPrice;
        }
        return { ...b, currentPrice };
      })
    );
  }

  res.json({ success: true, roundId: round.id, picks, openPositions, settledPositions, battleBalance });
}

export async function handleBattlePlace(req, res, db, user) {
  const { roundId, marketId, outcomeIndex, stake } = req.body || {};
  const stakeNum = Number(stake);

  if (!roundId || !marketId || (outcomeIndex !== 0 && outcomeIndex !== 1)) {
    return res.status(400).json({ error: '잘못된 요청입니다.' });
  }
  if (!(stakeNum >= BATTLE_MIN_STAKE && stakeNum <= BATTLE_MAX_STAKE)) {
    return res.status(400).json({ error: `베팅 금액은 ${BATTLE_MIN_STAKE}~${BATTLE_MAX_STAKE} 포인트 사이여야 합니다.` });
  }

  const roundSnap = await db.collection('battleRounds').doc(roundId).get();
  if (!roundSnap.exists) return res.status(409).json({ error: '라운드를 찾을 수 없습니다.' });
  const picks = roundSnap.data().picks || [];
  if (!picks.some((p) => p.marketId === String(marketId))) {
    return res.status(409).json({ error: '현재 라운드에 없는 마켓입니다.' });
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

  const existingSnap = await db
    .collection('battlePositions')
    .where('uid', '==', user.localId)
    .where('marketId', '==', String(marketId))
    .where('status', '==', 'open')
    .get();
  if (!existingSnap.empty) {
    return res.status(409).json({ error: '이 마켓에는 이미 베팅했습니다.' });
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
        marketId: String(marketId),
        conditionId: String(market.conditionId || ''),
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
  res.json({ success: true, positionId: posRef.id, entryPrice, newBalance: freshUser.data().battleBalance });
}
