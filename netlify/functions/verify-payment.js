/**
 * OmenFi — verify-payment Netlify Function
 * Verifies a SOL payment on-chain and issues a signed unlock token.
 */

const LAMPORTS_PER_SOL = 1_000_000_000;
const ASSET_PRICES = {
  ethereum: 0.05, ripple: 0.05, solana: 0.05, binancecoin: 0.05,
  dogecoin: 0.05, cardano: 0.05, avalanche: 0.05, shibainu: 0.05,
  hedera: 0.05, sui: 0.05, chainlink: 0.05,
  all: 0.2, // unlock all bundle
};

async function hmacSign(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
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
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

// Robustly extract a string address from whatever the RPC returns
function extractAddress(key) {
  if (!key) return '';
  if (typeof key === 'string') return key;
  if (typeof key === 'object') {
    return key.pubkey || key.toString() || '';
  }
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

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { signature, assetId, walletAddress } = body;

  if (!signature || signature.length < 60)   return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid signature' }) };
  if (!assetId || !ASSET_PRICES[assetId])    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid asset' }) };
  if (!walletAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid wallet address' }) };
  }

  const TREASURY = process.env.TREASURY_WALLET;
  const SECRET   = process.env.SECRET_KEY;
  const RPC_URL  = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

  if (!TREASURY || !SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    const tx = await getTransaction(signature, RPC_URL);

    if (!tx) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Transaction not found or not yet confirmed. Please wait a moment and try again.' }) };

    // Check tx succeeded on chain
    if (tx.meta?.err) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Transaction failed on-chain' }) };

    // Extract all account keys as plain strings
    const rawKeys = tx.transaction?.message?.accountKeys || [];
    const accountKeys = rawKeys.map(extractAddress);

    console.log('Account keys in tx:', accountKeys);
    console.log('Looking for treasury:', TREASURY);
    console.log('Looking for sender:', walletAddress);

    // Find treasury index
    const treasuryIdx = accountKeys.findIndex(k => k === TREASURY);
    if (treasuryIdx === -1) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: `Treasury wallet not found in transaction. Keys found: ${accountKeys.join(', ')}` })
      };
    }

    // Check balance increased for treasury
    const pre      = Number(tx.meta.preBalances[treasuryIdx])  || 0;
    const post     = Number(tx.meta.postBalances[treasuryIdx]) || 0;
    const received = (post - pre) / LAMPORTS_PER_SOL;
    const required = ASSET_PRICES[assetId];

    console.log(`Treasury balance: pre=${pre} post=${post} received=${received} required=${required}`);

    if (received < required * 0.96) { // 4% tolerance for bundle rounding
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: `Insufficient payment: received ${received.toFixed(4)} SOL, required ${required} SOL` })
      };
    }

    // Verify sender is in the transaction
    const senderIdx = accountKeys.findIndex(k => k === walletAddress);
    if (senderIdx === -1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Sender wallet not found in transaction' }) };
    }

    // Note: No time restriction — purchases are permanent and never expire
    // Recovery use case requires verifying old transactions
    const txTime = tx.blockTime || 0;

    // Issue HMAC-signed unlock token
    const tokenData = `${walletAddress}:${assetId}:${signature}:${txTime}`;
    const tokenHmac = await hmacSign(SECRET, tokenData);
    const unlockToken = btoa(JSON.stringify({ d: tokenData, h: tokenHmac }));

    console.log(`✓ Unlocked: ${walletAddress} → ${assetId} via ${signature}`);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, assetId, unlockToken }),
    };

  } catch (err) {
    console.error('verify-payment error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
