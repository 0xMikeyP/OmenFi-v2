/**
 * OmenFi — validate-tokens
 *
 * Accepts { tokens: { assetId: tokenString } }
 * Returns { validAssets: ['ethereum', 'solana', ...] }
 *
 * Tokens from both purchase flow and recovery flow are accepted.
 * Recovery tokens have 'slot' in the data — we trust the HMAC only.
 */

async function hmac(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function timingSafe(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

exports.handler = async function(event) {
  const h = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Content-Type':'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:h, body:'' };
  if (event.httpMethod !== 'POST') return { statusCode:405, headers:h, body: JSON.stringify({ error:'Method not allowed' }) };

  const SECRET = process.env.SECRET_KEY;
  if (!SECRET) return { statusCode:500, headers:h, body: JSON.stringify({ error:'Config error' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode:400, headers:h, body: JSON.stringify({ error:'Bad JSON' }) }; }

  const { tokens } = body;
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) {
    return { statusCode:400, headers:h, body: JSON.stringify({ error:'tokens must be an object {assetId: token}' }) };
  }

  const validAssets = [];
  const entries = Object.entries(tokens).slice(0, 15); // max 15 (11 paid + margin)

  for (const [assetId, token] of entries) {
    if (!assetId || !token || typeof token !== 'string') continue;
    try {
      const decoded = JSON.parse(atob(token));
      const { d, h: storedHmac } = decoded;
      if (!d || !storedHmac) continue;
      const expected = await hmac(SECRET, d);
      if (!timingSafe(expected, storedHmac)) continue;
      // HMAC valid — trust the assetId key from localStorage
      if (!validAssets.includes(assetId)) validAssets.push(assetId);
    } catch { continue; }
  }

  return { statusCode:200, headers:h, body: JSON.stringify({ validAssets }) };
};
