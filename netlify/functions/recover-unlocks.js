/**
 * OmenFi — recover-unlocks
 *
 * Scans treasury transactions for payments FROM the user's wallet
 * that contain an OmenFi memo (omenfi:<assetId>).
 *
 * The memo IS the receipt. No amount guessing, no bundle detection.
 * omenfi:ethereum = unlock ethereum
 * omenfi:all      = unlock all 11 assets
 * omenfi:tip      = tip (ignored, not an unlock)
 */

const LAMPORTS_PER_SOL = 1_000_000_000;
const MIN_LAMPORTS     = Math.round(0.01 * LAMPORTS_PER_SOL); // 0.01 SOL minimum (tips excluded by memo check)

const PAID_ASSETS = ['ethereum','ripple','solana','binancecoin','dogecoin','cardano','avalanche','shibainu','hedera','sui','chainlink'];

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

function extractAddress(key) {
  if (!key) return '';
  if (typeof key === 'string') return key;
  if (typeof key === 'object') return key.pubkey || String(key);
  return String(key);
}

// Extract OmenFi memo from transaction if present
function getOmenfiMemo(tx) {
  // Check log messages first (most reliable)
  const logs = tx.meta?.logMessages || [];
  for (const log of logs) {
    const match = log.match(/omenfi:([a-z]+)/i);
    if (match) return match[1].toLowerCase();
  }
  // Fallback: check raw transaction JSON
  const txStr = JSON.stringify(tx.transaction || {});
  const match = txStr.match(/omenfi:([a-z]+)/i);
  if (match) return match[1].toLowerCase();
  return null;
}

function issueToken(secret, walletAddress, assetId, signature, txTime) {
  // Returns a Promise<string> — the HMAC token
  const d = `${walletAddress}:${assetId}:${signature}:${txTime}`;
  return hmac(secret, d).then(h => btoa(JSON.stringify({ d, h })));
}

exports.handler = async function(event) {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Content-Type':'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };
  if (event.httpMethod !== 'POST') return { statusCode:405, headers, body: JSON.stringify({ error:'Method not allowed' }) };

  const TREASURY = process.env.TREASURY_WALLET;
  const SECRET   = process.env.SECRET_KEY;
  const RPC_URL  = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

  if (!TREASURY || !SECRET) return { statusCode:500, headers, body: JSON.stringify({ error:'Config error' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode:400, headers, body: JSON.stringify({ error:'Bad JSON' }) }; }

  const { walletAddress } = body;
  if (!walletAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return { statusCode:400, headers, body: JSON.stringify({ error:'Invalid wallet' }) };
  }

  try {
    // Paginate through all treasury transactions
    const sigs = [];
    let before;
    while (true) {
      const batch = await rpc(RPC_URL, 'getSignaturesForAddress', [TREASURY, { limit:1000, ...(before ? { before } : {}) }]) || [];
      if (!batch.length) break;
      sigs.push(...batch);
      if (batch.length < 1000) break;
      before = batch[batch.length - 1].signature;
    }

    console.log(`Treasury: ${sigs.length} txs. Scanning for ${walletAddress}`);

    // payments is a map: assetId -> {signature, tokens[]}
    // Using a map so duplicate purchases of same asset don't double-unlock
    const unlockedAssets = new Map();

    for (const s of sigs) {
      if (s.err) continue;
      try {
        const tx = await rpc(RPC_URL, 'getTransaction', [s.signature, { encoding:'jsonParsed', commitment:'confirmed', maxSupportedTransactionVersion:0 }]);
        if (!tx || tx.meta?.err) continue;

        // Check OmenFi memo first — fast exit if not an OmenFi tx
        const memoAsset = getOmenfiMemo(tx);
        if (!memoAsset) continue;           // not an OmenFi transaction
        if (memoAsset === 'tip') continue;  // tip, not a purchase

        // Verify sender is this wallet (fee payer = index 0)
        const keys = (tx.transaction?.message?.accountKeys || []).map(extractAddress);
        if (keys[0] !== walletAddress) continue;

        // Verify treasury received SOL
        const ti = keys.findIndex(k => k === TREASURY);
        if (ti === -1) continue;
        const received = (Number(tx.meta.postBalances[ti]) || 0) - (Number(tx.meta.preBalances[ti]) || 0);
        if (received < MIN_LAMPORTS) continue;

        const txTime = tx.blockTime || 0;
        console.log(`Found: ${s.signature} memo=omenfi:${memoAsset} ${received/LAMPORTS_PER_SOL} SOL`);

        if (memoAsset === 'all') {
          // Unlock all paid assets
          for (const assetId of PAID_ASSETS) {
            if (!unlockedAssets.has(assetId)) {
              const token = await issueToken(SECRET, walletAddress, assetId, s.signature, txTime);
              unlockedAssets.set(assetId, token);
            }
          }
        } else if (PAID_ASSETS.includes(memoAsset)) {
          // Unlock specific asset
          if (!unlockedAssets.has(memoAsset)) {
            const token = await issueToken(SECRET, walletAddress, memoAsset, s.signature, txTime);
            unlockedAssets.set(memoAsset, token);
          }
        }
      } catch(e) { continue; }
    }

    // Convert map to array format frontend expects
    const payments = [];
    if (unlockedAssets.size > 0) {
      const tokensByAsset = {};
      for (const [assetId, token] of unlockedAssets) {
        tokensByAsset[assetId] = token;
      }
      payments.push({ tokensByAsset, count: unlockedAssets.size });
    }

    console.log(`Recovery complete: ${unlockedAssets.size} asset(s) for ${walletAddress}`);
    return { statusCode:200, headers, body: JSON.stringify({ success:true, payments }) };

  } catch(err) {
    console.error('recover-unlocks:', err.message);
    return { statusCode:500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
