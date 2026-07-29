// ABC News / BBC News RSS를 서버에서 대신 가져와줌 (브라우저 직접 fetch는 CORS에 막힘).
// 원래 abc-news.js / donga-news.js 두 개였는데, Vercel Hobby 플랜의 서버리스 함수
// 12개 제한에 걸려서 ?source= 파라미터로 하나의 함수로 합침. 메인 피드는 처음
// 동아일보였다가(2026-07-29), CNN 피드가 2023년에 멈춰있는 걸 발견해서 BBC로 교체.
const SOURCES = {
  abc: 'https://abcnews.go.com/abcnews/topstories',
  bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const source = SOURCES[req.query.source] ? req.query.source : 'abc';
  try {
    const r = await fetch(SOURCES[source], {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PredictAnalyticsBot/1.0; +https://predictanalytics-news.vercel.app)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(502).json({ error: `${source} 응답 오류: ${r.status}` });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
