/**
 * OmenFi — validate-tokens Netlify Function
 * Re-validates stored HMAC unlock tokens on app load.
 */

async function hmacSign(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const SECRET = process.env.SECRET_KEY;
  if (!SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { tokens } = body;
  if (!tokens) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing tokens' }) };

  const validAssets = [];

  // tokens can be either:
  // 1. An object {assetId: token} — new format, assetId is the key
  // 2. An array of tokens — old format, extract assetId from token data
  const entries = Array.isArray(tokens)
    ? tokens.map(t => [null, t])           // old format — no assetId key
    : Object.entries(tokens).slice(0, 20); // new format — assetId is the key

  for (const [assetId, token] of entries) {
    try {
      const decoded = JSON.parse(atob(token));
      const { d, h } = decoded;
      if (!d || !h) continue;
      const expected = await hmacSign(SECRET, d);
      if (!timingSafeEqual(expected, h)) continue;

      // Use the explicit assetId key if provided (new format)
      // Otherwise fall back to extracting from token data (old format)
      const resolvedId = assetId || d.split(':')[1];
      if (resolvedId && !resolvedId.startsWith('recovery_slot') && !validAssets.includes(resolvedId)) {
        validAssets.push(resolvedId);
      }
    } catch { continue; }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ validAssets }) };
};
