export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, markets, cryptoData } = req.body;
  const key = process.env.GROQ_API_KEY;

  const marketContext = (markets || [])
    .slice(0, 8)
    .map(m => `- ${m.question}: ${m.prob}% (거래량 $${Number(m.volume || 0).toLocaleString()})`)
    .join('\n');

  const cryptoContext = cryptoData ? `
📊 실시간 암호화폐 시세:
- 비트코인(BTC): $${Number(cryptoData.btc?.price || 0).toLocaleString()} (24h: ${cryptoData.btc?.change24h}%)
- 이더리움(ETH): $${Number(cryptoData.eth?.price || 0).toLocaleString()} (24h: ${cryptoData.eth?.change24h}%)
- 시가총액(BTC): $${(cryptoData.btc?.marketCap / 1e9)?.toFixed(0)}B
- 공포탐욕지수: ${cryptoData.fearGreed?.value}/100 (${cryptoData.fearGreed?.label})` : '';

  const systemText = `당신은 예측 시장 전문 AI 어시스턴트 "PredictAI"입니다. 폴리마켓(Polymarket) 실시간 데이터를 기반으로 예측 분석, 투자 인사이트, 심층 리포트를 제공합니다.
${cryptoContext}

현재 주요 폴리마켓 마켓:
${marketContext || '마켓 데이터 없음'}

규칙: 항상 한국어로 답변. 구체적인 수치와 근거 제시. 투자 조언이 아닌 분석 정보임을 명시. 간결하고 핵심적으로 답변.`;

  const groqMessages = [
    { role: 'system', content: systemText },
    ...(messages || [])
  ];

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: groqMessages,
        max_tokens: 1000,
        temperature: 0.8
      })
    });
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const reply = data.choices?.[0]?.message?.content || '응답 실패';
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
