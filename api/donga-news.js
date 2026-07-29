// 동아일보 RSS를 서버에서 대신 가져와줌 (api/abc-news.js와 동일한 이유 — CORS 회피).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://rss.donga.com/total.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PredictAnalyticsBot/1.0; +https://predictanalytics-news.vercel.app)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(502).json({ error: `동아일보 응답 오류: ${r.status}` });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
