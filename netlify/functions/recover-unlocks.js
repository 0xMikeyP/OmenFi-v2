/**
 * OmenFi — recover-unlocks
 *
 * Scans treasury wallet for payments from the user's wallet.
 * Issues HMAC tokens directly — no secondary verification needed.
 * One transaction = one or more asset slots depending on amount paid.
 */

const LAMPORTS_PER_SOL    = 1_000_000_000;
const MIN_LAMPORTS        = Math.round(0.048 * LAMPORTS_PER_SOL); // 0.05 SOL - 4%
const UNLOCK_ALL_LAMPORTS = Math.round(0.190 * LAMPORTS_PER_SOL); // 0.20 SOL - 5%
const PAID_ASSET_COUNT    = 11;

async function hmac(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

function addr(key) {
  if (!key) return '';
  if (typeof key === 'string') return key;
  if (typeof key === 'object') return key.pubkey || String(key);
  return String(key);
}

exports.handler = async function(event) {
  const h = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Content-Type':'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:h, body:'' };
  if (event.httpMethod !== 'POST') return { statusCode:405, headers:h, body: JSON.stringify({ error:'Method not allowed' }) };

  const TREASURY = process.env.TREASURY_WALLET;
  const SECRET   = process.env.SECRET_KEY;
  const RPC      = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

  if (!TREASURY || !SECRET) return { statusCode:500, headers:h, body: JSON.stringify({ error:'Config error' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode:400, headers:h, body: JSON.stringify({ error:'Bad JSON' }) }; }

  const { walletAddress } = body;
  if (!walletAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return { statusCode:400, headers:h, body: JSON.stringify({ error:'Invalid wallet' }) };
  }

  try {
    // Scan treasury transaction history
    const sigs = [];
    let before;
    while (true) {
      const params = [TREASURY, { limit:1000, ...(before ? { before } : {}) }];
      const batch = await rpc(RPC, 'getSignaturesForAddress', params) || [];
      if (!batch.length) break;
      sigs.push(...batch);
      if (batch.length < 1000) break;
      before = batch[batch.length - 1].signature;
    }

    console.log(`Treasury: ${sigs.length} txs. Looking for ${walletAddress}`);

    const payments = [];

    for (const s of sigs) {
      if (s.err) continue;
      try {
        const tx = await rpc(RPC, 'getTransaction', [s.signature, { encoding:'jsonParsed', commitment:'confirmed', maxSupportedTransactionVersion:0 }]);
        if (!tx || tx.meta?.err) continue;

        const keys = (tx.transaction?.message?.accountKeys || []).map(addr);
        const si = keys.findIndex(k => k === walletAddress);
        const ti = keys.findIndex(k => k === TREASURY);
        if (si === -1 || ti === -1) continue;

        const received = (Number(tx.meta.postBalances[ti]) || 0) - (Number(tx.meta.preBalances[ti]) || 0);
        if (received < MIN_LAMPORTS) continue;

        const isBundle  = received >= UNLOCK_ALL_LAMPORTS;
        const slotCount = isBundle ? PAID_ASSET_COUNT : 1;
        const txTime    = tx.blockTime || 0;
        const solAmt    = received / LAMPORTS_PER_SOL;

        // Issue one HMAC token per asset slot
        const tokens = [];
        for (let i = 0; i < slotCount; i++) {
          const d = `${walletAddress}:slot${i}:${s.signature}:${txTime}`;
          const h2 = await hmac(SECRET, d);
          tokens.push(btoa(JSON.stringify({ d, h: h2 })));
        }

        payments.push({ signature: s.signature, solAmt, isBundle, slotCount, tokens });
        console.log(`Found: ${s.signature} ${solAmt} SOL ${isBundle ? '(bundle)' : ''}`);
      } catch(e) { continue; }
    }

    console.log(`Done: ${payments.length} payment(s) for ${walletAddress}`);
    return { statusCode:200, headers:h, body: JSON.stringify({ success:true, payments }) };

  } catch(err) {
    console.error('recover-unlocks:', err.message);
    return { statusCode:500, headers:h, body: JSON.stringify({ error: err.message }) };
  }
};
