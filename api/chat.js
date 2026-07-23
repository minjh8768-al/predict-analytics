export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, markets } = req.body;
  const marketContext = (markets || [])
    .slice(0, 8)
    .map(m => `- ${m.question}: ${m.prob}% (거래량 $${Number(m.volume||0).toLocaleString()})`)
    .join('\n');

  const system = `당신은 예측 시장 전문 AI 어시스턴트 "PredictAI"입니다. 폴리마켓(Polymarket) 실시간 데이터를 기반으로 예측 분석, 투자 인사이트, 심층 리포트를 제공합니다.

현재 주요 폴리마켓 마켓:
${marketContext || '마켓 데이터 없음'}

규칙:
- 항상 한국어로 답변
- 구체적인 수치와 근거 제시
- 투자 조언이 아닌 분석 정보임을 명시
- 간결하고 핵심적으로 답변
- 마크다운 형식 사용 가능`;

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
        max_tokens: 1000,
        system,
        messages
      })
    });
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.json({ reply: data.content[0].text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
