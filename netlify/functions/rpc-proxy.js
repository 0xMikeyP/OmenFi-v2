/**
 * OmenFi — rpc-proxy Netlify Function
 *
 * Proxies Solana RPC calls from the frontend to Helius,
 * keeping the Helius API key server-side only.
 *
 * Only allows safe read methods needed for payment flow.
 * Blocks any write methods that could be abused.
 */

// Methods the frontend is allowed to call
const ALLOWED_METHODS = new Set([
  'getLatestBlockhash',
  'getTransaction',
  'confirmTransaction',
  'getSignatureStatuses',
  'getBalance',
]);

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const RPC_URL = process.env.SOLANA_RPC_URL;
  if (!RPC_URL) return { statusCode: 500, headers, body: JSON.stringify({ error: 'RPC not configured' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // Validate method is whitelisted
  const method = body.method;
  if (!method || !ALLOWED_METHODS.has(method)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: `Method '${method}' not allowed` }) };
  }

  // Forward to Helius — only pass whitelisted fields, not raw body
  const safePayload = {
    jsonrpc: '2.0',
    id: typeof body.id === 'number' ? body.id : 1,
    method: method,
    params: Array.isArray(body.params) ? body.params : [],
  };

  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safePayload),
    });

    const text = await res.text();
    console.log('Helius response status:', res.status, 'first 80 chars:', text.slice(0, 80));

    // Detect JWT response — Helius returns this when API key is invalid/rate limited
    if (text.startsWith('eyJ')) {
      console.error('Helius returned JWT — falling back to public RPC');
      // Fall back to public Solana RPC
      const fallback = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(safePayload),
      });
      const fallbackText = await fallback.text();
      console.log('Public RPC response:', fallbackText.slice(0, 80));
      return { statusCode: 200, headers, body: fallbackText };
    }

    // Ensure it's valid JSON before returning
    if (!text.startsWith('{') && !text.startsWith('[')) {
      console.error('Non-JSON from Helius:', text.slice(0, 100));
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Invalid RPC response' }) };
    }

    return { statusCode: 200, headers, body: text };
  } catch (err) {
    console.error('RPC proxy error:', err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'RPC request failed: ' + err.message }) };
  }
};
