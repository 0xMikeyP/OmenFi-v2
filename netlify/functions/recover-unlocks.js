/**
 * OmenFi — recover-unlocks Netlify Function
 *
 * Scans treasury wallet history for payments from the connecting wallet.
 * Issues HMAC tokens directly so frontend can store them without extra round-trips.
 */

const LAMPORTS_PER_SOL  = 1_000_000_000;
const REQUIRED_LAMPORTS = Math.round(0.048 * LAMPORTS_PER_SOL); // 0.05 SOL with tolerance
const UNLOCK_ALL_LAMPORTS = Math.round(0.19 * LAMPORTS_PER_SOL); // 0.2 SOL with tolerance
const PAID_ASSETS_COUNT = 11;

async function hmacSign(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function getAllSignatures(address, rpcUrl) {
  const all = [];
  let before = undefined;
  while (true) {
    const params = [address, { limit: 1000, ...(before ? { before } : {}) }];
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params }),
    });
    const json = await res.json();
    const batch = json.result || [];
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    before = batch[batch.length - 1].signature;
  }
  return all;
}

async function getTransaction(signature, rpcUrl) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getTransaction',
      params: [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }],
    }),
  });
  const json = await res.json();
  return json.result;
}

function extractAddress(key) {
  if (!key) return '';
  if (typeof key === 'string') return key;
  if (typeof key === 'object') return key.pubkey || key.toString() || '';
  return String(key);
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const TREASURY = process.env.TREASURY_WALLET;
  const SECRET   = process.env.SECRET_KEY;
  const RPC_URL  = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

  if (!TREASURY || !SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { walletAddress } = body;
  if (!walletAddress) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing walletAddress' }) };
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid wallet address' }) };
  }

  try {
    const allSigs = await getAllSignatures(TREASURY, RPC_URL);
    console.log(`Treasury has ${allSigs.length} txs. Scanning for ${walletAddress}`);

    const recoveredPayments = [];

    for (const sigInfo of allSigs) {
      if (sigInfo.err) continue;
      try {
        const tx = await getTransaction(sigInfo.signature, RPC_URL);
        if (!tx || tx.meta?.err) continue;

        const accountKeys = (tx.transaction?.message?.accountKeys || []).map(extractAddress);
        const senderIdx   = accountKeys.findIndex(k => k === walletAddress);
        const treasuryIdx = accountKeys.findIndex(k => k === TREASURY);
        if (senderIdx === -1 || treasuryIdx === -1) continue;

        const pre      = Number(tx.meta.preBalances[treasuryIdx]) || 0;
        const post     = Number(tx.meta.postBalances[treasuryIdx]) || 0;
        const received = post - pre;
        if (received < REQUIRED_LAMPORTS) continue;

        const txTime      = tx.blockTime || 0;
        const receivedSol = received / LAMPORTS_PER_SOL;
        const isUnlockAll = received >= UNLOCK_ALL_LAMPORTS;
        const assetCount  = isUnlockAll ? PAID_ASSETS_COUNT : 1;

        // Issue HMAC tokens directly here — one per asset slot
        // Frontend maps these to real asset IDs in order
        const tokens = [];
        for (let i = 0; i < assetCount; i++) {
          const tokenData = `${walletAddress}:recovery_slot_${i}:${sigInfo.signature}:${txTime}`;
          const tokenHmac = await hmacSign(SECRET, tokenData);
          const token = btoa(JSON.stringify({ d: tokenData, h: tokenHmac }));
          tokens.push(token);
        }

        recoveredPayments.push({
          signature: sigInfo.signature,
          timestamp: txTime,
          receivedSol,
          isUnlockAll,
          assetCount,
          tokens,
        });

        console.log(`Found: ${sigInfo.signature} — ${receivedSol} SOL — ${assetCount} asset(s)`);
      } catch(e) {
        continue;
      }
    }

    console.log(`Recovery complete: ${recoveredPayments.length} payment(s) for ${walletAddress}`);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, paymentsFound: recoveredPayments.length, payments: recoveredPayments }),
    };

  } catch (err) {
    console.error('recover-unlocks error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
