// ABC News / BBC News / Reddit RSS를 서버에서 대신 가져와줌 (브라우저 직접 fetch는 CORS에 막힘).
// 원래 abc-news.js / donga-news.js 두 개였는데, Vercel Hobby 플랜의 서버리스 함수
// 12개 제한에 걸려서 ?source= 파라미터로 하나의 함수로 합침. 메인 피드는 처음
// 동아일보였다가(2026-07-29), CNN 피드가 2023년에 멈춰있는 걸 발견해서 BBC로 교체.
// reddit 소스는 IP당 요청 제한이 매우 빡빡해서(테스트 중 1회 만에 429) 메모리 캐시를 둠.
const SOURCES = {
  abc: 'https://abcnews.go.com/abcnews/topstories',
  bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
  reddit_predictionmarkets: 'https://www.reddit.com/r/PredictionMarkets/.rss',
  reddit_wallstreetbets: 'https://www.reddit.com/r/wallstreetbets/.rss',
  reddit_economics: 'https://www.reddit.com/r/economics/.rss',
};
const REDDIT_CACHE_TTL_MS = 120000;
const redditCache = new Map(); // source -> { text, fetchedAt }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const source = SOURCES[req.query.source] ? req.query.source : 'abc';
  const isReddit = source.startsWith('reddit_');

  if (isReddit) {
    const cached = redditCache.get(source);
    if (cached && Date.now() - cached.fetchedAt < REDDIT_CACHE_TTL_MS) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.status(200).send(cached.text);
    }
  }

  try {
    const r = await fetch(SOURCES[source], {
      headers: {
        'User-Agent': isReddit
          ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
          : 'Mozilla/5.0 (compatible; PredictAnalyticsBot/1.0; +https://predictanalytics-news.vercel.app)',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      // Reddit가 레이트리밋(429) 걸면, 캐시가 오래됐어도 없는 것보단 나으니 그거라도 반환.
      if (isReddit && redditCache.has(source)) {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        return res.status(200).send(redditCache.get(source).text);
      }
      return res.status(502).json({ error: `${source} 응답 오류: ${r.status}` });
    }
    const text = await r.text();
    if (isReddit) redditCache.set(source, { text, fetchedAt: Date.now() });
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    if (isReddit && redditCache.has(source)) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.status(200).send(redditCache.get(source).text);
    }
    res.status(500).json({ error: e.message });
  }
}
