import { verifyToken } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyToken(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { title, excerpt, category, prob } = req.body;
  const key = process.env.GROQ_API_KEY;

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'user',
          content: `예측 분석 전문가로서 다음 뉴스를 분석해줘.

카테고리: ${category}
제목: ${title}
내용: ${excerpt}
현재 예측 확률: ${prob}%

아래 형식으로 한국어로 답변해:

📌 **핵심 요약**
(2-3문장으로 핵심 내용)

📊 **예측시장 영향**
영향도: 높음/중간/낮음
(현재 ${prob}% 확률의 배경 설명)

💡 **투자 인사이트**
(예측 시장 참여자가 주목할 포인트 1-2개)

⚠️ **주요 리스크**
(변수가 될 수 있는 요인 1가지)`
        }],
        max_tokens: 700,
        temperature: 0.7
      })
    });
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = data.choices?.[0]?.message?.content || '분석 실패';
    res.json({ summary: text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
