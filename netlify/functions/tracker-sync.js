/**
 * OmenFi — tracker-sync
 * Stores and retrieves DCA tracker data per wallet address.
 * Uses Netlify Blobs for persistent server-side storage.
 * Keyed by wallet address — each wallet owns its own data.
 */

const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Validate wallet address from query param
  const walletAddress = event.queryStringParameters?.wallet;
  if (!walletAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid wallet address' }) };
  }

  const store = getStore('omenfi-tracker');

  // GET — load tracker data for this wallet
  if (event.httpMethod === 'GET') {
    try {
      const data = await store.get(walletAddress, { type: 'json' });
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ success: true, data: data || null }),
      };
    } catch(e) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: null }) };
    }
  }

  // POST — save tracker data for this wallet
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { data } = body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing data' }) };
    }

    // Safety: strip wallet key from data to prevent cross-wallet poisoning
    // Only store the strategies array and metadata, not other wallets' data
    const safeData = {
      strategies: Array.isArray(data.strategies) ? data.strategies.slice(0, 20) : [],
      extraSlots:  typeof data.extraSlots === 'number' ? Math.min(data.extraSlots, 20) : 0,
      activeIdx:   typeof data.activeIdx === 'number' ? data.activeIdx : 0,
      updatedAt:   Date.now(),
    };

    // Validate each strategy
    const VALID_ASSETS = ['bitcoin','ethereum','ripple','solana','binancecoin','dogecoin','cardano','avalanche','shibainu','hedera','sui','chainlink'];
    const VALID_FREQS  = ['daily','weekly','monthly'];
    safeData.strategies = safeData.strategies.filter(s =>
      VALID_ASSETS.includes(s.assetId) &&
      VALID_FREQS.includes(s.frequency) &&
      typeof s.amount === 'number' && s.amount > 0 &&
      Array.isArray(s.buys) && s.buys.length <= 10000
    );

    try {
      await store.setJSON(walletAddress, safeData);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch(e) {
      console.error('tracker-sync save error:', e.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Save failed' }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
