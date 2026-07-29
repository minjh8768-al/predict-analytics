// 사이드바 "빠른 통계"의 S&P 500 / VIX 실시간 값을 서버에서 대신 가져옴
// (Yahoo Finance chart API는 CORS 헤더가 없어서 브라우저 직접 fetch가 막힘).
const SYMBOLS = { sp500: '%5EGSPC', vix: '%5EVIX' };

async function fetchQuote(symbol) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PredictAnalyticsBot/1.0)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`${symbol} 응답 오류: ${r.status}`);
  const data = await r.json();
  const meta = data.chart.result[0].meta;
  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  return { price, prevClose, change: price - prevClose };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const [sp500, vix] = await Promise.all([fetchQuote(SYMBOLS.sp500), fetchQuote(SYMBOLS.vix)]);
    res.status(200).json({ sp500, vix });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
