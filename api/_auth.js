const FIREBASE_API_KEY = 'AIzaSyDPnNCfbUSQXfmYhT4g1NMQcfXrVC20Cp0';

export async function verifyToken(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) }
    );
    if (!r.ok) return null;
    const data = await r.json();
    return data.users?.[0] || null;
  } catch {
    return null;
  }
}
