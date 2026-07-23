export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, markets } = req.body;
  const key = process.env.GEMINI_API_KEY;

  const marketContext = (markets || [])
    .slice(0, 8)
    .map(m => `- ${m.question}: ${m.prob}% (거래량 $${Number(m.volume || 0).toLocaleString()})`)
    .join('\n');

  const systemText = `당신은 예측 시장 전문 AI 어시스턴트 "PredictAI"입니다. 폴리마켓(Polymarket) 실시간 데이터를 기반으로 예측 분석, 투자 인사이트, 심층 리포트를 제공합니다.

현재 주요 폴리마켓 마켓:
${marketContext || '마켓 데이터 없음'}

규칙: 항상 한국어로 답변. 구체적인 수치와 근거 제시. 투자 조언이 아닌 분석 정보임을 명시. 간결하고 핵심적으로 답변.`;

  // Gemini 형식: role은 "user" / "model"
  const geminiContents = (messages || []).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 1000, temperature: 0.8 }
        })
      }
    );
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답 실패';
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
