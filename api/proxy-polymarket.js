// Proxy for Polymarket APIs — routes client requests through Vercel (US)
// so Korean IP blocks don't affect end users.
// Usage: /api/proxy-polymarket?url=https://gamma-api.polymarket.com/markets?...

const ALLOWED_HOSTS = [
  'gamma-api.polymarket.com',
  'clob.polymarket.com',
];

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'url param required' });

  let parsed;
  try { parsed = new URL(target); } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return res.status(403).json({ error: 'host not allowed' });
  }

  // Forward any additional query params appended by the client
  const qs = new URLSearchParams(req.query);
  qs.delete('url');
  if ([...qs].length) {
    for (const [k, v] of qs) parsed.searchParams.set(k, v);
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { 'Accept': 'application/json' },
    });
    const body = await upstream.text();
    res.status(upstream.status)
      .setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      .setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
      .send(body);
  } catch (e) {
    res.status(502).json({ error: 'upstream fetch failed', detail: e.message });
  }
}
