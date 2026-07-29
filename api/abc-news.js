// ABC News RSS를 서버에서 대신 가져와줌 — 브라우저에서 직접 fetch하면 CORS에 막히는데,
// 서버 대 서버 요청은 CORS 제약이 없음. 예전엔 무료 공개 프록시(allorigins, corsproxy.io)를
// 썼는데 둘 다 죽어서(응답 없음/403) 우리 자체 엔드포인트로 대체.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://abcnews.go.com/abcnews/topstories', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PredictAnalyticsBot/1.0; +https://predictanalytics-news.vercel.app)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(502).json({ error: `ABC News 응답 오류: ${r.status}` });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
