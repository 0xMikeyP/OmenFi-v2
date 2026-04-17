/**
 * OmenFi — recover-unlocks Netlify Function
 *
 * Recovers purchases by scanning the treasury wallet's transaction history
 * for payments FROM the connecting wallet. Since we search the treasury
 * (not the user's wallet), we find OmenFi payments only — no limit issues.
 *
 * The Solana blockchain is permanent. This works forever, for any wallet,
 * no matter how many transactions they've made.
 */

const LAMPORTS_PER_SOL  = 1_000_000_000;
const REQUIRED_LAMPORTS    = Math.round(0.048 * LAMPORTS_PER_SOL); // min per asset (0.05 SOL with tolerance)
const UNLOCK_ALL_LAMPORTS  = Math.round(0.19  * LAMPORTS_PER_SOL); // unlock-all bundle (0.2 SOL with tolerance)
const PAID_ASSETS_COUNT    = 11; // number of paid assets (excludes BTC which is free)

async function hmacSign(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// Fetch all signatures for an address, paginating through ALL of them
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
    if (batch.length < 1000) break; // last page
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
      params: [signature, {
        encoding: 'jsonParsed',
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      }],
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
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

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
  // Validate Solana address format (base58, 32-44 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid wallet address format' }) };
  }

  try {
    // Search the TREASURY's transaction history, not the user's
    // This only returns OmenFi payments — fast and complete regardless
    // of how many transactions the user has made on Solana
    const allSigs = await getAllSignatures(TREASURY, RPC_URL);

    console.log(`Treasury has ${allSigs.length} total transactions. Scanning for payments from ${walletAddress}`);

    const recoveredPayments = [];

    for (const sigInfo of allSigs) {
      if (sigInfo.err) continue;

      try {
        const tx = await getTransaction(sigInfo.signature, RPC_URL);
        if (!tx || tx.meta?.err) continue;

        const accountKeys = (tx.transaction?.message?.accountKeys || []).map(extractAddress);

        // Check this tx involves our user's wallet as sender
        const senderIdx  = accountKeys.findIndex(k => k === walletAddress);
        const treasuryIdx = accountKeys.findIndex(k => k === TREASURY);

        if (senderIdx === -1 || treasuryIdx === -1) continue;

        // Verify treasury received at least 0.048 SOL (covers 0.05 per asset with tolerance)
        const pre      = Number(tx.meta.preBalances[treasuryIdx])  || 0;
        const post     = Number(tx.meta.postBalances[treasuryIdx]) || 0;
        const received = post - pre;

        if (received < REQUIRED_LAMPORTS) continue;

        // Valid OmenFi payment from this wallet
        // Return the raw payment data — the frontend will assign the correct
        // assetId and request a properly-signed token via verify-payment
        const txTime = tx.blockTime || 0;

        const receivedSol = received / LAMPORTS_PER_SOL;
        const isUnlockAll = received >= UNLOCK_ALL_LAMPORTS;

        recoveredPayments.push({
          signature: sigInfo.signature,
          walletAddress,
          timestamp: txTime,
          receivedSol,
          isUnlockAll, // true if payment was the unlock-all bundle
          assetCount: isUnlockAll ? PAID_ASSETS_COUNT : 1, // how many assets this covers
        });

        console.log(`Found payment: ${sigInfo.signature} — ${received / LAMPORTS_PER_SOL} SOL`);
      } catch(e) {
        continue;
      }
    }

    console.log(`Recovery complete: ${recoveredPayments.length} payment(s) found for ${walletAddress}`);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        paymentsFound: recoveredPayments.length,
        payments: recoveredPayments,
      }),
    };

  } catch (err) {
    console.error('recover-unlocks error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
