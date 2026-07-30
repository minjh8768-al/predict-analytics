import { verifyToken } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyToken(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { question, probability, volume, outcomes, type, kospi, sp500, btc, dateLabel } = req.body;
  const key = process.env.GROQ_API_KEY;

  const prompt = type === 'daily'
    ? `너는 금융시장 리포트 작성 전문가야. 아래 실제 시세를 바탕으로 ${dateLabel || '오늘'} 기준 시장 리포트를 한국어로 작성해줘.

코스피(KOSPI): ${kospi.price.toFixed(2)} (전일 대비 ${kospi.change >= 0 ? '+' : ''}${kospi.change.toFixed(2)})
S&P 500: ${sp500.price.toFixed(2)} (전일 대비 ${sp500.change >= 0 ? '+' : ''}${sp500.change.toFixed(2)})
비트코인(BTC): $${Math.round(btc.price).toLocaleString()} (24시간 대비 ${btc.change >= 0 ? '+' : ''}${btc.change.toFixed(1)}%)

아래 형식으로 작성해:

🇰🇷 **한국 증시 (코스피)**
(오늘 수치를 바탕으로 한 흐름 요약과 배경 추정)

🇺🇸 **미국 증시 (S&P 500)**
(오늘 수치를 바탕으로 한 흐름 요약과 배경 추정)

₿ **비트코인**
(오늘 수치를 바탕으로 한 흐름 요약과 배경 추정)

📌 **오늘의 한 줄 요약**
(세 시장을 종합한 한 문장 요약)

숫자는 위에 주어진 실제 값만 사용하고, 사실을 지어내지 마.`
    : `폴리마켓 예측 분석 전문가로서 다음 마켓을 심층 분석해줘.

질문: ${question}
현재 확률: ${probability}%
총 거래량: $${Number(volume).toLocaleString()}
결과 옵션: ${outcomes}

아래 형식으로 한국어로 분석해:

🎯 **마켓 분석**
(이 예측 마켓의 의미와 현재 ${probability}% 확률의 배경)

📈 **상승 시나리오**
(확률이 올라갈 수 있는 주요 촉매 요인들)

📉 **하락 시나리오**
(확률이 내려갈 수 있는 주요 리스크 요인들)

⏰ **주목 일정**
(향후 주요 이벤트/날짜)

💰 **트레이딩 포인트**
(이 마켓에서 포지션 잡을 때 고려할 핵심 1가지)`;

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 900,
        temperature: 0.7
      })
    });
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = data.choices?.[0]?.message?.content || '분석 실패';
    res.json({ analysis: text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
