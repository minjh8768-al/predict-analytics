import { verifyToken } from './_auth.js';
import { FieldValue } from 'firebase-admin/firestore';

// 예측배틀(턴제 과거마켓 데모) — 기존 api/bet.js의 개별 마켓 연속 베팅과는
// 완전히 별개의 경제(battleBalance)/데이터 모델. Vercel Hobby 12개 함수 제한이
// 이미 꽉 차서(bet.js가 12/12) 이 파일은 라우트가 아닌 헬퍼로만 존재 — `_`
// 접두사라 함수 개수에 안 잡히고, api/bet.js가 import해서 씀.
//
// v4: 이미 resolve된 실제 마켓 7라운드 x 5개(총 35개)를 무작위로 뽑아 구성.
// 결과가 이미 정해져 있으므로 베팅 즉시 정산(크론/비동기 정산 불필요).
// CLOB은 resolve된 마켓의 가격 히스토리를 전혀 안 돌려주는 걸 실측 확인했기
// 때문에(역대 최대 거래량 마켓으로도 0개), "그 당시 확률"은 복구 불가 —
// 그래서 확률은 합성(가짜)해서 확률/배당 UI만 유지한다. 질문 한국어 번역도
// 같은 Groq 배치 호출에 얹어서 한 번에 받아온다.

export const BATTLE_SESSION_LENGTH = 7;
export const BATTLE_PICKS_PER_ROUND = 5;
export const BATTLE_TOTAL_PICKS = BATTLE_SESSION_LENGTH * BATTLE_PICKS_PER_ROUND;
// Gamma API는 limit을 몇으로 주든 실측상 100개로 잘라서 돌려준다(확인됨) —
// 그래서 top-100(전부 초유명 이벤트)만 후보로 쓰면 LLM이 학습 데이터로
// "이미 아는" 사실을 맞히는 꼴이 되어 AI 예측이 항상 정답이 되는 문제가
// 생긴다. offset 페이지네이션으로 여러 페이지를 모아 유명한 것부터
// 덜 알려진 것까지 섞인 풀을 만든다.
export const BATTLE_CANDIDATE_PAGE_SIZE = 100;
export const BATTLE_CANDIDATE_PAGES = 10; // 최대 1,000개 풀
export const BATTLE_STARTING_BALANCE = 10000;
export const BATTLE_MIN_STAKE = 10;
export const BATTLE_MAX_STAKE = 2000;
const FAKE_PRICE_MIN = 0.08;
const FAKE_PRICE_MAX = 0.92;

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

async function pickHistoricalMarkets(n) {
  const pages = await Promise.all(
    Array.from({ length: BATTLE_CANDIDATE_PAGES }, (_, i) =>
      fetch(
        `https://gamma-api.polymarket.com/markets?closed=true&limit=${BATTLE_CANDIDATE_PAGE_SIZE}&offset=${i * BATTLE_CANDIDATE_PAGE_SIZE}&order=volumeNum&ascending=false`,
        { headers: { Accept: 'application/json' } }
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    )
  );
  const markets = pages.flat();
  if (!markets.length) throw new Error('과거 마켓 목록이 비어있습니다.');

  const eligible = markets.filter((m) => {
    const outcomes = parseJsonArray(m.outcomes);
    if (outcomes.length !== 2) return false;
    const prices = parseJsonArray(m.outcomePrices).map(Number);
    return prices.findIndex((p) => p >= 0.99) !== -1;
  });

  const pool = eligible.length >= n ? eligible : markets;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// 예측(0|1)+확신도+한국어 번역을 한 번의 Groq 배치 호출로 받아온다 —
// 35개를 개별 호출하면 너무 느리고 비효율적.
async function generateAiPredictions(questions) {
  const key = process.env.GROQ_API_KEY;
  const fallback = questions.map((q) => ({ outcome: 0, confidence: 1, questionKo: q, analysis: '' }));
  try {
    const list = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: `너는 예측시장 전문 애널리스트 겸 번역가야. 아래 ${questions.length}개 예측시장 질문
각각에 대해 다음 네 가지를 해줘:
1. 실제로 결과가 어떻게 됐을지 추측 — 각 질문의 첫 번째 선택지가 맞으면 0, 두 번째 선택지가 맞으면 1
2. 확신도 1~3(3이 가장 확신)
3. 질문을 자연스러운 한국어로 번역(questionKo)
4. 왜 그렇게 예측했는지 한국어로 한 문장 근거(analysis) — 당시 여론조사·시장 심리·해당 분야 상식 등을
   근거로 짧고 구체적으로(예: "임기 중 지지율이 높았고 야당 지지세가 분산되어 있었습니다")

${list}

반드시 아래 JSON 형식으로만, 목록 순서 그대로 ${questions.length}개를 답해:
{"predictions":[{"outcome":0|1,"confidence":1|2|3,"questionKo":"...","analysis":"..."}, ...]}`,
          },
        ],
        max_tokens: 6000,
        temperature: 0.5,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(text);
    const preds = Array.isArray(parsed.predictions) ? parsed.predictions : [];
    return questions.map((q, i) => {
      const p = preds[i];
      const outcome = p && Number(p.outcome) === 1 ? 1 : 0;
      const confidence = p && [1, 2, 3].includes(Number(p.confidence)) ? Number(p.confidence) : 1;
      const questionKo = (p && typeof p.questionKo === 'string' && p.questionKo.trim()) || q;
      const analysis = (p && typeof p.analysis === 'string' && p.analysis.trim()) || '';
      return { outcome, confidence, questionKo, analysis };
    });
  } catch (e) {
    return fallback;
  }
}

async function createNewSession(db, uid) {
  const activeSnap = await db
    .collection('battleSessions')
    .where('uid', '==', uid)
    .where('status', '==', 'active')
    .get();
  if (!activeSnap.empty) {
    const batch = db.batch();
    activeSnap.docs.forEach((d) => batch.update(d.ref, { status: 'abandoned' }));
    await batch.commit();
  }

  const markets = await pickHistoricalMarkets(BATTLE_TOTAL_PICKS);
  const questions = markets.map((m) => m.question || '');
  const predictions = await generateAiPredictions(questions);

  const allPicks = markets.map((m, i) => {
    const outcomes = parseJsonArray(m.outcomes);
    const prices = parseJsonArray(m.outcomePrices).map(Number);
    const actualOutcomeIndex = prices.findIndex((p) => p >= 0.99);
    return {
      marketId: String(m.id),
      conditionId: String(m.conditionId || ''),
      question: m.question || '',
      questionKo: predictions[i].questionKo,
      outcomes: [outcomes[0] || 'Yes', outcomes[1] || 'No'],
      fakeEntryPrice: Math.round((FAKE_PRICE_MIN + Math.random() * (FAKE_PRICE_MAX - FAKE_PRICE_MIN)) * 1000) / 1000,
      actualOutcomeIndex: actualOutcomeIndex === -1 ? 0 : actualOutcomeIndex,
      aiPrediction: predictions[i].outcome,
      aiConfidence: predictions[i].confidence,
      aiAnalysis: predictions[i].analysis,
    };
  });

  const rounds = [];
  for (let i = 0; i < BATTLE_SESSION_LENGTH; i++) {
    rounds.push({
      picks: allPicks.slice(i * BATTLE_PICKS_PER_ROUND, (i + 1) * BATTLE_PICKS_PER_ROUND),
      results: new Array(BATTLE_PICKS_PER_ROUND).fill(null),
    });
  }

  const sessionRef = db.collection('battleSessions').doc();
  await sessionRef.set({
    uid,
    status: 'active',
    rounds,
    currentRound: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: sessionRef.id, uid, status: 'active', rounds, currentRound: 0 };
}

function publicPick(p) {
  return {
    question: p.question,
    questionKo: p.questionKo,
    outcomes: p.outcomes,
    fakeEntryPrice: p.fakeEntryPrice,
    aiPrediction: p.aiPrediction,
    aiConfidence: p.aiConfidence,
    aiAnalysis: p.aiAnalysis,
  };
}

function publicSessionView(session) {
  const pastRounds = session.rounds.slice(0, session.currentRound).map((r, ri) => ({
    picks: r.picks.map((p) => ({ questionKo: p.questionKo, outcomes: p.outcomes, actualOutcomeIndex: p.actualOutcomeIndex })),
    results: r.results,
  }));
  const current = session.currentRound < BATTLE_SESSION_LENGTH ? session.rounds[session.currentRound] : null;
  return {
    id: session.id,
    status: session.status,
    currentRound: session.currentRound,
    totalRounds: BATTLE_SESSION_LENGTH,
    picksPerRound: BATTLE_PICKS_PER_ROUND,
    pastRounds,
    currentRoundPicks: current ? current.picks.map(publicPick) : null,
    currentRoundResults: current ? current.results : null,
  };
}

async function getActiveSession(db, uid) {
  const snap = await db
    .collection('battleSessions')
    .where('uid', '==', uid)
    .where('status', '==', 'active')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function handleBattleStatus(req, res, db) {
  let user = null;
  try { user = await verifyToken(req); } catch { user = null; }

  if (!user) {
    return res.json({ success: true, session: null, battleBalance: null });
  }

  const { balance } = await ensureBattleBalance(db, user.localId);
  const session = await getActiveSession(db, user.localId);
  res.json({ success: true, session: session ? publicSessionView(session) : null, battleBalance: balance });
}

export async function handleBattleStartSession(req, res, db, user) {
  const session = await createNewSession(db, user.localId);
  const { balance } = await ensureBattleBalance(db, user.localId);
  res.json({ success: true, session: publicSessionView(session), battleBalance: balance });
}

export async function handleBattlePlace(req, res, db, user) {
  const { sessionId, pickIdx, outcomeIndex, stake } = req.body || {};
  const stakeNum = Number(stake);
  const pickIdxNum = Number(pickIdx);

  if (!sessionId || !Number.isInteger(pickIdxNum) || pickIdxNum < 0 || pickIdxNum >= BATTLE_PICKS_PER_ROUND || (outcomeIndex !== 0 && outcomeIndex !== 1)) {
    return res.status(400).json({ error: '잘못된 요청입니다.' });
  }
  if (!(stakeNum >= BATTLE_MIN_STAKE && stakeNum <= BATTLE_MAX_STAKE)) {
    return res.status(400).json({ error: `베팅 금액은 ${BATTLE_MIN_STAKE}~${BATTLE_MAX_STAKE} 포인트 사이여야 합니다.` });
  }

  const sessionRef = db.collection('battleSessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
  const session = sessionSnap.data();
  if (session.uid !== user.localId || session.status !== 'active') {
    return res.status(409).json({ error: '진행 중인 게임이 아닙니다.' });
  }
  const roundIdx = session.currentRound;
  if (roundIdx >= BATTLE_SESSION_LENGTH || session.rounds[roundIdx].results[pickIdxNum]) {
    return res.status(409).json({ error: '이미 진행된 항목입니다.' });
  }

  const pick = session.rounds[roundIdx].picks[pickIdxNum];
  const price = outcomeIndex === 0 ? pick.fakeEntryPrice : 1 - pick.fakeEntryPrice;
  const correct = outcomeIndex === pick.actualOutcomeIndex;
  const payout = correct ? Math.round((stakeNum / price) * 100) / 100 : 0;

  const { ref: userRef } = await ensureBattleBalance(db, user.localId);
  let newBalance;

  try {
    newBalance = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(userRef);
      const freshBalance = freshSnap.exists
        ? (freshSnap.data().battleBalance ?? BATTLE_STARTING_BALANCE)
        : BATTLE_STARTING_BALANCE;
      if (freshBalance < stakeNum) throw new Error('INSUFFICIENT_BALANCE');

      const net = payout - stakeNum;
      tx.set(userRef, { battleBalance: FieldValue.increment(net) }, { merge: true });

      const rounds = session.rounds.map((r) => ({ picks: r.picks, results: [...r.results] }));
      rounds[roundIdx].results[pickIdxNum] = { outcomeIndex, stake: stakeNum, correct, payout, skipped: false };
      tx.update(sessionRef, { rounds });

      return freshBalance + net;
    });
  } catch (e) {
    if (e.message === 'INSUFFICIENT_BALANCE') {
      return res.status(409).json({ error: '가상 잔액이 부족합니다.' });
    }
    throw e;
  }

  res.json({
    success: true,
    correct,
    actualOutcomeIndex: pick.actualOutcomeIndex,
    outcomeLabel: pick.outcomes[pick.actualOutcomeIndex],
    payout,
    battleBalance: newBalance,
  });
}

export async function handleBattleNextRound(req, res, db, user) {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: '잘못된 요청입니다.' });

  const sessionRef = db.collection('battleSessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
  const session = sessionSnap.data();
  if (session.uid !== user.localId || session.status !== 'active') {
    return res.status(409).json({ error: '진행 중인 게임이 아닙니다.' });
  }
  const roundIdx = session.currentRound;
  if (roundIdx >= BATTLE_SESSION_LENGTH) {
    return res.status(409).json({ error: '이미 종료된 게임입니다.' });
  }

  const rounds = session.rounds.map((r) => ({ picks: r.picks, results: [...r.results] }));
  rounds[roundIdx].results = rounds[roundIdx].results.map((res_) => res_ || { skipped: true });
  const nextRound = roundIdx + 1;

  await sessionRef.update({
    rounds,
    currentRound: nextRound,
    status: nextRound >= BATTLE_SESSION_LENGTH ? 'done' : 'active',
  });

  res.json({ success: true });
}
