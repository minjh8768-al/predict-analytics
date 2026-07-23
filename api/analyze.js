export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, probability, volume, outcomes } = req.body;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        messages: [{
          role: 'user',
          content: `폴리마켓 예측 분석 전문가로서 다음 마켓을 심층 분석해줘.

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
(이 마켓에서 포지션 잡을 때 고려할 핵심 1가지)`
        }]
      })
    });
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.json({ analysis: data.content[0].text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
