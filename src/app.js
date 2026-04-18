/* ============================================
   OMENFI v5 — Pure historical backtester
   No future projections. Real prices only.
   API: CryptoCompare free (no key needed)
   Build: 2026-04-17-v7.1
   ============================================ */
console.log('OmenFi build: 2026-04-14-v7.1');
'use strict';

// ============================================
// ON-SCREEN DEBUG PANEL (remove before launch)
// ============================================
(function() {
  const logs = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  function capture(type, args) {
    const msg = Array.from(args).map(a => {
      try { return typeof a === 'object' ? JSON.stringify(a).slice(0,200) : String(a); }
      catch(e) { return String(a); }
    }).join(' ');
    logs.push({ type, msg, t: new Date().toLocaleTimeString() });
    if (logs.length > 40) logs.shift();
    updatePanel();
  }
  console.log  = function() { orig.log.apply(console, arguments);  capture('log',   arguments); };
  console.warn = function() { orig.warn.apply(console, arguments); capture('warn',  arguments); };
  console.error= function() { orig.error.apply(console,arguments); capture('error', arguments); };
  window.onerror = function(msg, src, line) { capture('error', [msg + ' (line '+line+')']); return false; };
  window.onunhandledrejection = function(e) { capture('error', ['Unhandled: ' + (e.reason?.message || e.reason)]); };

  function updatePanel() {
    const el = document.getElementById('_dbg');
    if (!el) return;
    el.innerHTML = logs.slice(-20).map(l =>
      `<div style="color:${l.type==='error'?'#ff6b6b':l.type==='warn'?'#ffd93d':'#aaa'};font-size:10px;border-bottom:1px solid #222;padding:2px 0;word-break:break-all">[${l.t}] ${l.msg}</div>`
    ).join('');
    el.scrollTop = el.scrollHeight;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.createElement('div');
    panel.id = '_dbg';
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:220px;overflow-y:auto;background:#111;z-index:9999;padding:6px;display:none;font-family:monospace';
    document.body.appendChild(panel);

    const toggle = document.createElement('button');
    toggle.textContent = '🔍 Debug';
    toggle.style.cssText = 'position:fixed;bottom:0;right:0;z-index:10000;background:#333;color:#fff;border:none;padding:6px 10px;font-size:11px;opacity:0.7';
    toggle.onclick = () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      updatePanel();
    };
    document.body.appendChild(toggle);
  });
})();

// Sanitize any string before inserting into innerHTML — prevents XSS
function sanitize(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Validate a Solana wallet address (base58, 32-44 chars)
function isValidWallet(addr) {
  return typeof addr === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

// Validate a date string YYYY-MM-DD
function isValidDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
}

const CC_BASE   = 'https://min-api.cryptocompare.com/data/v2';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Assets ordered by market cap (largest first)
const ASSETS = {
  bitcoin:     { name: 'Bitcoin',  symbol: 'BTC', icon: '₿', color: '#f7931a', free: true,  ccSym: 'BTC',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1.png' },
  ethereum:    { name: 'Ethereum', symbol: 'ETH', icon: 'Ξ', color: '#627eea', free: false, price: 0.05, ccSym: 'ETH',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png' },
  ripple:      { name: 'XRP',      symbol: 'XRP', icon: '✕', color: '#00aae4', free: false, price: 0.05, ccSym: 'XRP',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/52.png' },
  solana:      { name: 'Solana',   symbol: 'SOL', icon: '◎', color: '#9945ff', free: false, price: 0.05, ccSym: 'SOL',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png' },
  binancecoin: { name: 'BNB',      symbol: 'BNB', icon: '◆', color: '#f3ba2f', free: false, price: 0.05, ccSym: 'BNB',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1839.png' },
  dogecoin:    { name: 'Dogecoin', symbol: 'DOGE', icon: 'Ð', color: '#c2a633', free: false, price: 0.05, ccSym: 'DOGE',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/74.png' },
  cardano:     { name: 'Cardano',  symbol: 'ADA',  icon: '₳', color: '#0033ad', free: false, price: 0.05, ccSym: 'ADA',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/2010.png' },
  avalanche:   { name: 'Avalanche',symbol: 'AVAX', icon: 'A', color: '#e84142', free: false, price: 0.05, ccSym: 'AVAX',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5805.png' },
  shibainu:    { name: 'SHIB',     symbol: 'SHIB', icon: '🐕', color: '#ffa409', free: false, price: 0.05, ccSym: 'SHIB',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5994.png' },
  hedera:      { name: 'Hedera',   symbol: 'HBAR', icon: 'ℏ', color: '#222222', free: false, price: 0.05, ccSym: 'HBAR',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/4642.png' },
  sui:         { name: 'Sui',      symbol: 'SUI',  icon: '◈', color: '#4da2ff', free: false, price: 0.05, ccSym: 'SUI',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png' },
  chainlink:   { name: 'Chainlink',symbol: 'LINK', icon: '⬡', color: '#2a5ada', free: false, price: 0.05, ccSym: 'LINK',
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1975.png' }
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ---- Local date helpers (no UTC offset issues) ----
const pad = n => String(n).padStart(2,'0');
function localStr(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseLocal(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function today() { return localStr(new Date()); }
function yesterday() { const d = new Date(); d.setDate(d.getDate()-1); return localStr(d); }
function yearsAgo(n) { const d = new Date(); d.setFullYear(d.getFullYear()-n); return localStr(d); }

let state = {
  asset: 'bitcoin', amount: 100, frequency: 'weekly',
  startDate: yearsAgo(3), endDate: yesterday(),
  chartView: 'dollar',   // 'dollar' or 'coin'
  walletProvider: null,  // 'phantom'
  priceData: null, weeklyData: null, seasonality: null,
  simResult: null, chart: null,
  wallet: null, unlockedAssets: new Set(['bitcoin']),
  calAsset: 'bitcoin', calView: 'monthly', calYear: 'all'
};

// ============================================
// PERSISTENCE
// ============================================
function loadUnlocked() {
  try { const r = localStorage.getItem('omenfi_v5_unlocked'); if (r) state.unlockedAssets = new Set(['bitcoin',...JSON.parse(r)]); } catch {}
}
function saveUnlocked() {
  try { localStorage.setItem('omenfi_v5_unlocked', JSON.stringify([...state.unlockedAssets].filter(a=>a!=='bitcoin'))); } catch {}
}
function unlockAsset(id) { state.unlockedAssets.add(id); saveUnlocked(); refreshAssetUI(); }

// Persist wallet address across page reloads (Phantom mobile reloads page after connect)
function saveWallet(pubkey) {
  try { if (pubkey) localStorage.setItem('omenfi_wallet', pubkey); else localStorage.removeItem('omenfi_wallet'); } catch {}
}
function loadWallet() {
  try { return localStorage.getItem('omenfi_wallet') || null; } catch { return null; }
}
function saveWalletProvider(type) {
  try { if (type) localStorage.setItem('omenfi_wallet_provider', type); else localStorage.removeItem('omenfi_wallet_provider'); } catch {}
}
function loadWalletProvider() {
  try { return localStorage.getItem('omenfi_wallet_provider') || 'phantom'; } catch { return 'phantom'; }
}

const $ = id => document.getElementById(id);

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  loadUnlocked();
  refreshUnlockAllBar();

  // Restore wallet after Phantom reloads the page on mobile connect
  // Phantom injects window.solana asynchronously AFTER DOMContentLoaded,
  // so we poll for up to 2 seconds before deciding whether to restore or clear
  const savedWallet = loadWallet();
  if (savedWallet && isValidWallet(savedWallet)) {
    let restored = false;

    const doRestore = () => {
      if (restored) return;
      restored = true;
      state.wallet = savedWallet;
      state.walletProvider = loadWalletProvider();
      $('wallet-btn-text').textContent = savedWallet.slice(0,4)+'...'+savedWallet.slice(-4);
      $('wallet-btn').classList.add('connected');
      // Close modal if it's open (e.g. connect modal was showing during page reload)
      const bd = $('modal-backdrop');
      if (bd && bd.style.display !== 'none') closeModal();
      restoreServerUnlocks(savedWallet).catch(() => {});
      refreshUnlockAllBar();
      const pu = sessionStorage.getItem('pu');
      if (pu) { sessionStorage.removeItem('pu'); setTimeout(() => openUnlockModal(pu), 300); }
    };

    // Method 1: Poll for Phantom injection (handles async injection)
    let attempts = 0;
    const tryRestore = () => {
      attempts++;
      if (isPhantomInjected()) {
        const p = window.phantom?.solana || window.solana;
        if (p) p.on?.('connect', (pk) => {
          if (pk) saveWallet(pk.toString());
          doRestore();
        });
        if (!state.walletProvider) state.walletProvider = 'phantom';
        // If Phantom already has publicKey (already authorized this session),
        // update savedWallet with the live key in case it changed
        if (p?.publicKey) saveWallet(p.publicKey.toString());
        doRestore();
      } else if (isSolflareInjected()) {
        const p = window.solflare;
        if (p) p.on?.('connect', (pk) => {
          if (pk) saveWallet(pk.toString());
          doRestore();
        });
        if (!state.walletProvider) state.walletProvider = 'seedvault';
        doRestore();
      } else if (attempts < 20) {
        setTimeout(tryRestore, 100);
      } else {
        // After 2s no wallet found — clear saved wallet
        saveWallet(null);
      }
    };
    setTimeout(tryRestore, 100);

    // Method 2: Listen for Phantom's 'connect' event directly on window
    // Phantom fires this after page reload when user approved connection
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'connect' || e.data?.type === 'phantomConnect') {
        const pk = e.data?.publicKey || e.data?.data?.publicKey;
        if (pk) {
          saveWallet(pk.toString());
          doRestore();
        }
      }
    });
  } else {
    // No saved wallet — but listen for Phantom's connect event in case
    // user approved in Phantom and page reloaded without us saving first
    const listenForConnect = (walletType) => {
      const p = walletType === 'seedvault'
        ? window.solflare
        : (window.phantom?.solana || window.solana);
      if (p?.publicKey) {
        const pk = p.publicKey.toString();
        saveWallet(pk);
        state.wallet = pk;
        state.walletProvider = walletType;
        $('wallet-btn-text').textContent = pk.slice(0,4)+'...'+pk.slice(-4);
        $('wallet-btn').classList.add('connected');
        restoreServerUnlocks(pk).catch(() => {});
      } else if (p) {
        p.on?.('connect', (publicKey) => {
          if (!publicKey) return;
          const pk = publicKey.toString();
          saveWallet(pk);
          onWalletConnected(pk, walletType);
        });
      }
    };
    // Poll for either provider injection
    let n = 0;
    const poll = () => {
      n++;
      if (isPhantomInjected())  { listenForConnect('phantom');   return; }
      if (isSolflareInjected()) { listenForConnect('seedvault'); return; }
      if (n < 20) setTimeout(poll, 100);
    };
    setTimeout(poll, 100);
  }

  $('start-date').value = state.startDate;
  $('end-date').value   = state.endDate; // defaults to yesterday — CryptoCompare lags 1 day

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // Asset selector
  document.querySelectorAll('#asset-selector .asset-card').forEach(b => b.addEventListener('click', () => onAssetClick(b, 'sim')));
  document.querySelectorAll('#cal-asset-grid .cal-asset-btn').forEach(b => b.addEventListener('click', () => onAssetClick(b, 'cal')));

  // Quick presets
  document.querySelectorAll('.preset-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const y = parseInt(b.dataset.years);
    $('start-date').value = yearsAgo(y); state.startDate = yearsAgo(y);
    $('end-date').value = yesterday();   state.endDate = yesterday();
  }));

  // Freq pills
  document.querySelectorAll('.freq-pill').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.freq-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); state.frequency = b.dataset.freq;
  }));

  $('amount').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    state.amount = (!isNaN(v) && v > 0 && v <= 1_000_000) ? v : 100;
  });
  $('start-date').addEventListener('change', e => {
    if (isValidDate(e.target.value)) { state.startDate = e.target.value; clearPresets(); }
  });
  $('end-date').addEventListener('change', e => {
    if (isValidDate(e.target.value)) { state.endDate = e.target.value; clearPresets(); }
  });

  $('run-btn').addEventListener('click', runBacktest);
  $('retry-btn').addEventListener('click', runBacktest);

  // Calendar
  document.querySelector('[data-tab="calendar"]').addEventListener('click', () => {
    if (!state.calSeasonality) loadCalendar('bitcoin');
  });

  $('month-detail-close').addEventListener('click', () => { $('month-detail-card').style.display='none'; });
  $('wallet-btn').addEventListener('click', openWalletModal);

  // Unlock All buttons — main page and calendar page
  ['main-unlock-all-btn', 'cal-unlock-all-btn'].forEach(btnId => {
    const btn = $(btnId);
    if (btn) btn.addEventListener('click', () => {
      if (!state.wallet) { openWalletModal(); return; }
      doUnlockAll();
    });
  });
  $('modal-close').addEventListener('click', closeModal);
  $('modal-backdrop').addEventListener('click', e => { if(e.target===$('modal-backdrop')) closeModal(); });

  refreshAssetUI();
});

function clearPresets() {
  document.querySelectorAll('.preset-btn').forEach(x => x.classList.remove('active'));
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  // Disable all panel animations during tab switch — prevents jank spike on mobile
  document.body.classList.add('no-anim');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id==='tab-'+tab));
  // Re-enable after a single frame
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-anim')));
}

function onAssetClick(btn, ctx) {
  const id = btn.dataset.id; if (!id) return;
  if (state.unlockedAssets.has(id)) {
    if (ctx === 'sim') {
      document.querySelectorAll('#asset-selector .asset-card').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); state.asset = id;
    } else {
      document.querySelectorAll('#cal-asset-grid .cal-asset-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); state.calAsset = id; loadCalendar(id);
    }
  } else openUnlockModal(id);
}

function refreshUnlockAllBar() {
  const allPaid = Object.keys(ASSETS).filter(id => id !== 'bitcoin');
  const allOwned = allPaid.every(id => state.unlockedAssets.has(id));
  const show = state.wallet && !allOwned;

  // Update both bars — DCA page and Calendar page
  ['unlock-all-bar', 'unlock-all-bar-cal'].forEach(id => {
    const bar = $(id);
    if (bar) bar.style.display = show ? 'block' : 'none';
  });
}

function refreshAssetUI() {
  document.querySelectorAll('#asset-selector .asset-card').forEach(btn => {
    const id = btn.dataset.id; if (!id) return;
    const a = ASSETS[id]; if (!a) return;
    const u = state.unlockedAssets.has(id);
    btn.classList.toggle('locked', !u);
    btn.classList.toggle('active', id === state.asset && u);
    // Per-asset color on the tile border for vibrancy
    if (!u) {
      btn.style.borderColor = hexToRgba(a.color, 0.35);
      btn.style.setProperty('--asset-glow', hexToRgba(a.color, 0.25));
    } else {
      btn.style.borderColor = '';
      btn.style.setProperty('--asset-glow', '');
    }
    const badge = btn.querySelector('.asset-badge');
    if (badge) {
      badge.textContent = u ? (a.free ? 'FREE' : 'OWNED') : (a.price || 0.05) + ' SOL';
      badge.className = 'asset-badge ' + (u ? (a.free ? 'free-badge' : 'owned-badge') : 'locked-badge');
    }
  });
  document.querySelectorAll('#cal-asset-grid .cal-asset-btn').forEach(btn => {
    const id = btn.dataset.id; if (!id) return;
    const a = ASSETS[id]; if (!a) return;
    const u = state.unlockedAssets.has(id);
    btn.classList.toggle('locked', !u);
    if (!u) {
      btn.style.borderColor = hexToRgba(a.color, 0.35);
    } else {
      btn.style.borderColor = '';
    }
    const s = btn.querySelector('.cal-status');
    if (s) {
      s.textContent = u ? (a.free ? 'FREE' : 'OWNED') : (a.price || 0.05) + ' SOL';
      s.className = 'cal-status ' + (u ? (a.free ? 'free' : 'owned') : 'locked');
    }
  });
}

// Convert hex color to rgba string
function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return 'rgba(255,140,42,'+alpha+')';
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}

// ============================================
// CACHE
// ============================================
function cGet(k) { try { const r=localStorage.getItem(k); if(!r) return null; const {ts,d}=JSON.parse(r); if(Date.now()-ts>CACHE_TTL){localStorage.removeItem(k);return null;} return d; } catch{return null;} }
function cSet(k,d) { try{localStorage.setItem(k,JSON.stringify({ts:Date.now(),d}));}catch{} }

// ============================================
// DATA FETCHING — CryptoCompare
// ============================================
async function fetchDaily(assetId) {
  const key='omenfi_daily_'+assetId;
  const hit=cGet(key); if(hit) return hit;

  const sym=ASSETS[assetId]?.ccSym;
  if(!sym) throw new Error('Unknown asset');

  const map = new Map();
  let toTs = Math.floor(Date.now()/1000);

  for (let i=0; i<8; i++) {
    const url=`${CC_BASE}/histoday?fsym=${sym}&tsym=USD&limit=2000&toTs=${toTs}&aggregate=1`;
    let res,json;
    try { res=await fetch(url); if(!res.ok) throw new Error(`API ${res.status}`); json=await res.json(); }
    catch(e){ throw new Error(e.message||'Network error'); }

    if(json.Response==='Error') throw new Error(json.Message||'No data for '+sym);
    const bars=json.Data?.Data||[]; if(!bars.length) break;

    for(const b of bars) {
      if(b.close>0 && b.time>0) {
        const d=new Date(b.time*1000);
        map.set(localStr(d), b.close);
      }
    }
    const first=bars[0]?.time||0;
    if(bars.length<2000 || first<1262304000) break;
    toTs=first-1;
    await sleep(120);
  }

  if(!map.size) throw new Error('No price data for '+sym);
  const dates=Array.from(map.keys()).sort();
  const result={dates, prices:dates.map(d=>map.get(d))};
  cSet(key,result); return result;
}

async function fetchWeekly(assetId) {
  const key='omenfi_weekly_'+assetId;
  const hit=cGet(key); if(hit) return hit;

  const sym=ASSETS[assetId]?.ccSym;
  const map=new Map();
  let toTs=Math.floor(Date.now()/1000);

  for(let i=0;i<5;i++){
    const url=`${CC_BASE}/histoweek?fsym=${sym}&tsym=USD&limit=2000&toTs=${toTs}&aggregate=1`;
    let res,json;
    try{ res=await fetch(url); if(!res.ok) throw new Error(`API ${res.status}`); json=await res.json(); }
    catch(e){ throw new Error(e.message||'Network error'); }

    if(json.Response==='Error') break;
    const bars=json.Data?.Data||[]; if(!bars.length) break;

    for(const b of bars){
      if(b.close>0 && b.time>0){
        const d=new Date(b.time*1000);
        map.set(localStr(d), b.close);
      }
    }
    const first=bars[0]?.time||0;
    if(bars.length<2000||first<1262304000) break;
    toTs=first-1;
    await sleep(120);
  }

  const dates=Array.from(map.keys()).sort();
  const result={dates, prices:dates.map(d=>map.get(d))};
  cSet(key,result); return result;
}

// ============================================
// SEASONALITY — Monthly
// ============================================
function computeMonthlySeasonality(daily) {
  const {dates,prices}=daily;
  const mmap={};
  for(let i=0;i<dates.length;i++){
    const [y,mo]=dates[i].split('-').map(Number);
    const k=`${y}-${pad(mo)}`;
    if(!mmap[k]) mmap[k]={year:y,month:mo-1,first:prices[i],last:prices[i]};
    else mmap[k].last=prices[i];
  }
  const byM=Array.from({length:12},()=>[]);
  for(const {month,first,last,year} of Object.values(mmap)){
    if(first>0) byM[month].push({year, ret:((last-first)/first)*100});
  }
  return byM.map((entries,m)=>{
    if(!entries.length) return {month:m,avg:0,winRate:0,best:null,worst:null,years:[],count:0,median:0,stdDev:0};
    const rets=entries.map(e=>e.ret);
    const avg=rets.reduce((a,b)=>a+b,0)/rets.length;
    const sorted=[...rets].sort((a,b)=>a-b);
    const mid=Math.floor(sorted.length/2);
    const median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
    const stdDev=Math.sqrt(rets.reduce((s,v)=>s+(v-avg)**2,0)/rets.length);
    return {
      month:m, avg, median, stdDev,
      winRate:(rets.filter(r=>r>0).length/rets.length)*100,
      best: entries.reduce((a,b)=>a.ret>b.ret?a:b),
      worst:entries.reduce((a,b)=>a.ret<b.ret?a:b),
      years:entries.sort((a,b)=>a.year-b.year),
      count:entries.length
    };
  });
}

// ============================================
// SEASONALITY — Weekly (week of year 1-53)
// ============================================
function computeWeeklySeasonality(weekly) {
  const {dates,prices}=weekly;
  const wmap={};
  for(let i=0;i<dates.length;i++){
    const d=parseLocal(dates[i]);
    const woy=getWeekOfYear(d);
    const year=d.getFullYear();
    const k=`${year}-W${pad(woy)}`;
    if(!wmap[k]) wmap[k]={year,week:woy,first:prices[i],last:prices[i]};
    else wmap[k].last=prices[i];
  }
  const byW=Array.from({length:53},()=>[]);
  for(const {week,first,last,year} of Object.values(wmap)){
    const idx=week-1;
    if(idx>=0&&idx<53&&first>0) byW[idx].push({year,ret:((last-first)/first)*100});
  }
  return byW.map((entries,i)=>{
    const w=i+1;
    if(!entries.length) return {week:w,avg:0,winRate:0,best:null,worst:null,count:0};
    const rets=entries.map(e=>e.ret);
    const avg=rets.reduce((a,b)=>a+b,0)/rets.length;
    return {
      week:w, avg,
      winRate:(rets.filter(r=>r>0).length/rets.length)*100,
      best: entries.reduce((a,b)=>a.ret>b.ret?a:b),
      worst:entries.reduce((a,b)=>a.ret<b.ret?a:b),
      count:entries.length
    };
  });
}

function getWeekOfYear(d) {
  const start=new Date(d.getFullYear(),0,1);
  return Math.ceil(((d-start)/86400000+start.getDay()+1)/7);
}

// ============================================
// DCA ENGINE — pure historical, real prices only
// ============================================
function runDCA(daily, amount, frequency, startDate, endDate, skipMonths=[], boostMonths=[], boostMult=2) {
  const {dates,prices}=daily;

  // Slice to range
  const rangeIdx=[];
  for(let i=0;i<dates.length;i++){
    if(dates[i]>=startDate && dates[i]<=endDate) rangeIdx.push(i);
  }
  if(!rangeIdx.length) return null;

  const priceMap=new Map();
  for(const i of rangeIdx) priceMap.set(dates[i],prices[i]);
  const rangeDates=rangeIdx.map(i=>dates[i]);
  const rangeStart=parseLocal(startDate);
  const rangeEnd  =parseLocal(endDate);

  // Generate buy schedule
  const buys=[];
  if(frequency==='daily'){
    for(const d of rangeDates) buys.push(d);
  } else if(frequency==='weekly'){
    let c=new Date(rangeStart);
    while(localStr(c)<=endDate){
      const n=nearestDate(rangeDates,priceMap,c,rangeEnd);
      if(n) buys.push(n);
      c.setDate(c.getDate()+7);
    }
  } else { // monthly
    let c=new Date(rangeStart); c.setDate(1);
    while(localStr(c)<=endDate){
      const n=nearestDate(rangeDates,priceMap,c,rangeEnd);
      if(n) buys.push(n);
      c.setMonth(c.getMonth()+1);
    }
  }

  // Deduplicate
  const seen=new Set();
  const uniqueBuys=buys.filter(d=>{ if(seen.has(d)) return false; seen.add(d); return true; });

  let invested=0, coins=0, count=0, peak=0, maxDD=0;
  const history=[];

  for(const d of uniqueBuys){
    const price=priceMap.get(d); if(!price||price<=0) continue;
    const month=parseInt(d.split('-')[1],10)-1;
    if(skipMonths.includes(month)) continue;
    const amt=boostMonths.includes(month)?amount*boostMult:amount;
    coins+=amt/price; invested+=amt; count++;
    const val=coins*price;
    if(val>peak) peak=val;
    const dd=peak>0?((peak-val)/peak)*100:0;
    if(dd>maxDD) maxDD=dd;
    history.push({date:d,invested,value:val,price,coins});
  }

  if(count===0) return null;

  // Final value uses the LAST REAL PRICE in the range
  const lastPrice=prices[rangeIdx[rangeIdx.length-1]];
  const finalValue=coins*lastPrice;
  const netProfit=finalValue-invested;
  const roi=invested>0?(netProfit/invested)*100:0;
  const avgBuy=coins>0?invested/coins:0;

  return {invested, finalValue, netProfit, roi, count, avgBuy, maxDD, history, lastPrice, coins};
}

function nearestDate(dates,priceMap,target,maxD){
  const maxStr=localStr(maxD);
  for(let i=0;i<7;i++){
    const c=new Date(target); c.setDate(c.getDate()+i);
    const s=localStr(c);
    if(s>maxStr) break;
    if(priceMap.has(s)) return s;
  }
  return null;
}

// ============================================
// STRATEGY OPTIMIZER
// ============================================
function optimize(seasonality, daily, amount, frequency, startDate, endDate) {
  // -------------------------------------------------------
  // CORRECT DCA PHILOSOPHY:
  // The goal is to accumulate the MOST underlying asset.
  // Buy HEAVY when prices are historically LOW (dip months) — more coin per dollar.
  // Skip months when prices are historically HIGH — less coin per dollar, bad time to buy.
  // This is the opposite of momentum investing.
  // We optimize for total coins accumulated, not just ROI.
  // -------------------------------------------------------

  const ranked = [...seasonality].filter(s => s.count >= 3).sort((a,b) => a.avg - b.avg);
  if (ranked.length < 6) return null;

  const baseline = runDCA(daily, amount, frequency, startDate, endDate);
  if (!baseline) return null;

  let best = null;
  let bestCoins = baseline.coins; // primary metric: maximize coin accumulation
  let bestROI   = baseline.roi;

  for (const skipN of [1, 2, 3]) {
    for (const boostN of [1, 2, 3]) {
      for (const mult of [1.5, 2, 3]) {
        // SKIP the historically STRONGEST months (price is high = expensive to buy)
        const skip  = ranked.slice(-skipN).map(m => m.month);
        // BOOST the historically WEAKEST months (price is low = cheap accumulation)
        const boost = ranked.slice(0, boostN).map(m => m.month).filter(m => !skip.includes(m));

        const r = runDCA(daily, amount, frequency, startDate, endDate, skip, boost, mult);
        if (!r) continue;

        // Primary: more coins. Secondary: also check ROI doesn't crater badly
        const coinsImproved = r.coins > bestCoins;
        const roiReasonable = r.roi > baseline.roi * 0.7; // don't tank ROI more than 30%
        if (coinsImproved && roiReasonable) {
          bestCoins = r.coins;
          bestROI   = r.roi;
          best = { skip, boost, mult, result: r };
        }
      }
    }
  }

  // If no combo improves coins without hurting ROI badly, fall back to best ROI
  if (!best) {
    let fallbackROI = baseline.roi;
    for (const skipN of [1, 2, 3]) {
      for (const boostN of [1, 2, 3]) {
        for (const mult of [1.5, 2, 3]) {
          const skip  = ranked.slice(-skipN).map(m => m.month);
          const boost = ranked.slice(0, boostN).map(m => m.month).filter(m => !skip.includes(m));
          const r = runDCA(daily, amount, frequency, startDate, endDate, skip, boost, mult);
          if (r && r.coins > baseline.coins) {
            if (!best || r.coins > best.result.coins) {
              best = { skip, boost, mult, result: r };
            }
          }
        }
      }
    }
  }

  return best ? { baseline, best, bStart: startDate, bEnd: endDate } : null;
}


// ============================================
// MAIN BACKTEST FLOW
// ============================================
async function runBacktest(){
  const amount   =parseFloat($('amount').value)||100;
  const startDate=$('start-date').value;
  const endDate  =$('end-date').value;
  const asset    =state.asset;
  const frequency=state.frequency;
  const todayStr =today();

  // Validation — both dates must be in the past
  if(!startDate||!endDate){ showErr('Please select both start and end dates.'); return; }
  if(startDate>=todayStr) { showErr('Start date must be in the past.'); return; }
  if(endDate>todayStr)    { showErr('End date cannot be in the future — use yesterday or earlier for reliable data.'); return; }
  if(startDate>=endDate)  { showErr('End date must be after start date.'); return; }

  clearErr(); $('results-area').style.display='none'; showLoad(true);
  state.chartView = 'dollar'; // reset view on new backtest
  const cvtD=$('cvt-dollar'); const cvtC=$('cvt-coin');
  if(cvtD){cvtD.classList.add('active');} if(cvtC){cvtC.classList.remove('active');}
  if($('csb-view-label')) $('csb-view-label').textContent='Dollar View';

  try{
    setMsg('Fetching price history...');
    const daily=await fetchDaily(asset);

    // Verify dates exist in data
    const firstAvail=daily.dates[0];
    const lastAvail =daily.dates[daily.dates.length-1];
    if(startDate<firstAvail) throw new Error(`${ASSETS[asset].name} data starts ${firstAvail}. Choose a later start date.`);
    if(endDate>lastAvail)    throw new Error(`Latest data available is ${lastAvail}. Adjust your end date.`);

    setMsg('Running DCA simulation...');
    const result=runDCA(daily,amount,frequency,startDate,endDate);
    if(!result) throw new Error('No buys executed in this range. Try a longer period or different frequency.');
    state.simResult=result;

    setMsg('Computing seasonality...');
    const seasonality=computeMonthlySeasonality(daily);
    state.seasonality=seasonality;

    setMsg('Running Strategy Optimizer...');
    // Pass user's date window — optimizer finds best strategy using seasonality from full history,
    // but the dollar comparison is always shown over the user's chosen period
    const opt=optimize(seasonality,daily,amount,frequency,startDate,endDate);

    // Smart DCA applied to user's period
    let smartResult=null;
    if(opt){
      smartResult=runDCA(daily,amount,frequency,startDate,endDate,opt.best.skip,opt.best.boost,opt.best.mult);
    }


    showLoad(false);
    $('results-area').style.display='flex';
    renderResults(result,asset,amount,frequency,startDate,endDate,smartResult);
    renderChart(result,smartResult);
    renderCurrentMonthIndicator(seasonality, asset);
    renderOptimizer(opt,seasonality);
    renderSmartDCA(result,smartResult,opt);
    renderForwardPlanner(seasonality, opt, amount, frequency, asset);
    setTimeout(()=>$('panel-results').scrollIntoView({behavior:'smooth',block:'start'}),100);

  }catch(err){
    console.error(err); showLoad(false); showErr(err.message||'Something went wrong.');
  }
}

// ============================================
// RENDER: RESULTS
// ============================================
function renderResults(r, asset, amount, freq, start, end, smartR){
  const a=ASSETS[asset], pos=r.roi>=0;
  $('results-meta').innerHTML=`Backtesting <strong>$${fmt(amount)} ${freq}</strong> buys into <strong>${a.name}</strong> &nbsp;·&nbsp; <strong>${start}</strong> → <strong>${end}</strong>`;
  $('m-value').textContent='$'+fmt(r.finalValue);
  $('m-change').textContent=(pos?'▲ +':'▼ ')+'$'+fmt(Math.abs(r.netProfit));
  $('m-change').className='metric-change '+(pos?'pos':'neg');
  $('m-invested').textContent='$'+fmt(r.invested);
  $('m-return').textContent=(pos?'+':'')+' $'+fmt(r.netProfit);
  $('m-return').className='metric-value '+(pos?'green':'red');
  $('m-roi').textContent=(pos?'+':'')+r.roi.toFixed(1)+'%';
  $('m-roi').className='metric-value '+(pos?'green':'red');
  $('m-buys').textContent=r.count.toLocaleString();
  $('m-avg-price').textContent='$'+fmt(r.avgBuy);

  // Coin accumulation comparison
  const stdCoins = r.coins || 0;
  const optCoins = smartR ? (smartR.coins || 0) : 0;
  if ($('m-std-coins')) $('m-std-coins').textContent = fmtCoins(stdCoins);
  if ($('m-opt-coins') && smartR) {
    $('m-opt-coins').textContent = fmtCoins(optCoins);
    const coinDiff = optCoins - stdCoins;
    const coinDiffEl = $('m-coin-diff');
    if (coinDiffEl) {
      coinDiffEl.textContent = (coinDiff >= 0 ? '+' : '') + fmtCoins(Math.abs(coinDiff));
      coinDiffEl.className = 'metric-change ' + (coinDiff >= 0 ? 'pos' : 'neg');
    }
  } else if ($('m-opt-coins')) {
    $('m-opt-coins').textContent = '—';
  }
}

// ============================================
// RENDER: CHART
// ============================================
// RENDER: CHART — Dollar view + Coin view toggle
// ============================================
function renderChart(r, smart) {
  if (state.chart) { state.chart.destroy(); state.chart = null; }

  const ctx     = $('dcaChart').getContext('2d');
  const hist    = r.history;
  const step    = Math.max(1, Math.floor(hist.length / 250));
  const pts     = hist.filter((_, i) => i % step === 0);
  if (pts[pts.length-1] !== hist[hist.length-1]) pts.push(hist[hist.length-1]);

  const labels    = pts.map(p => p.date);
  const stdValues = pts.map(p => p.value);
  const invested  = pts.map(p => p.invested);

  // Build smart DCA series aligned to same labels
  let smartValues = null;
  if (smart && smart.history.length) {
    const smap = new Map(smart.history.map(p => [p.date, p.value]));
    // Forward-fill gaps so the line is continuous
    let lastKnown = null;
    smartValues = labels.map(d => {
      if (smap.has(d)) { lastKnown = smap.get(d); return lastKnown; }
      return lastKnown;
    });
  }

  // Gradient fills
  // Build coin accumulation series (always computed, used in coin view)
  const stdCoins  = pts.map(p => p.coins || 0);
  let smartCoins  = null;
  if (smart && smart.history.length) {
    const scmap = new Map(smart.history.map(p => [p.date, p.coins]));
    let lastC = null;
    smartCoins = labels.map(d => {
      if (scmap.has(d)) { lastC = scmap.get(d); return lastC; }
      return lastC;
    });
  }

  state.chartData = { labels, stdValues, invested, smartValues, pts, stdCoins, smartCoins };
  state.chartView = 'dollar';

  // Build chart for current view
  buildChartDatasets(ctx, labels, stdValues, invested, smartValues, stdCoins, smartCoins);

  // Wire toggle buttons
  const cvtDollar = $('cvt-dollar');
  const cvtCoin   = $('cvt-coin');
  if (cvtDollar && cvtCoin) {
    cvtDollar.classList.toggle('active', true);
    cvtCoin.classList.toggle('active', false);
    cvtDollar.onclick = () => {
      state.chartView = 'dollar';
      cvtDollar.classList.add('active'); cvtCoin.classList.remove('active');
      if ($('csb-view-label')) $('csb-view-label').textContent = 'Dollar View';
      buildChartDatasets(ctx, labels, stdValues, invested, smartValues, stdCoins, smartCoins);
          showInitialScrub('dollar');
    };
    cvtCoin.onclick = () => {
      state.chartView = 'coin';
      cvtCoin.classList.add('active'); cvtDollar.classList.remove('active');
      if ($('csb-view-label')) $('csb-view-label').textContent = 'Coin View';
      buildChartDatasets(ctx, labels, stdValues, invested, smartValues, stdCoins, smartCoins);
      showInitialScrub('coin');
    };
  }

  // Build custom legend

  // Wire up scrub interaction
  wireChartScrub();

  // Show final data point on load
  setTimeout(() => showInitialScrub('dollar'), 900);
}

// Build or rebuild chart datasets based on current view
function buildChartDatasets(ctx, labels, stdValues, invested, smartValues, stdCoins, smartCoins) {
  if (state.chart) { state.chart.destroy(); state.chart = null; }

  const view = state.chartView || 'dollar';

  let datasets, yCallback;

  // pointRadius:0 and hoverRadius:0 everywhere — no dots on lines.
  // Crosshair line handles the position indicator instead.
  const noPoints = { pointRadius: 0, hoverRadius: 0, pointHoverRadius: 0 };

  if (view === 'dollar') {
    const gradStd = ctx.createLinearGradient(0, 0, 0, 340);
    gradStd.addColorStop(0, 'rgba(255,140,42,0.22)');
    gradStd.addColorStop(1, 'rgba(255,80,42,0.01)');
    const gradSmart = ctx.createLinearGradient(0, 0, 0, 340);
    gradSmart.addColorStop(0, 'rgba(0,232,122,0.18)');
    gradSmart.addColorStop(1, 'rgba(0,180,80,0.01)');

    datasets = [
      { label:'Invested',     data:invested,   borderColor:'rgba(255,255,255,0.22)', borderWidth:1.5, borderDash:[5,4], fill:false,  tension:0.3, order:3, ...noPoints },
      { label:'Standard DCA', data:stdValues,  borderColor:'#ff8c2a',                borderWidth:2.5, fill:true, backgroundColor:gradStd,   tension:0.3, order:2, ...noPoints }
    ];
    if (smartValues) {
      datasets.push({ label:'Optimized DCA', data:smartValues, borderColor:'#00e87a', borderWidth:2.5, fill:true, backgroundColor:gradSmart, tension:0.3, order:1, ...noPoints });
    }
    yCallback = v => '$' + fmtK(v);

  } else {
    const gradStdC = ctx.createLinearGradient(0, 0, 0, 340);
    gradStdC.addColorStop(0, 'rgba(167,139,250,0.2)');
    gradStdC.addColorStop(1, 'rgba(167,139,250,0.01)');
    const gradSmartC = ctx.createLinearGradient(0, 0, 0, 340);
    gradSmartC.addColorStop(0, 'rgba(0,232,122,0.2)');
    gradSmartC.addColorStop(1, 'rgba(0,180,80,0.01)');

    datasets = [
      { label:'Std Coins', data:stdCoins, borderColor:'#a78bfa', borderWidth:2.5, fill:true, backgroundColor:gradStdC, tension:0.3, order:2, ...noPoints }
    ];
    if (smartCoins) {
      datasets.push({ label:'Opt Coins', data:smartCoins, borderColor:'#00e87a', borderWidth:2.5, fill:true, backgroundColor:gradSmartC, tension:0.3, order:1, ...noPoints });
    }
    const sym = ASSETS[state.asset]?.symbol || 'BTC';
    yCallback = v => fmtCoins(v) + ' ' + sym;
  }

  state.chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: 'rgba(200,190,230,0.45)', font: { family: 'Share Tech Mono', size: 10 }, maxTicksLimit: 7, maxRotation: 0,
            callback: (val, i) => labels[i] ? labels[i].slice(0,7) : '' }
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: 'rgba(200,190,230,0.45)', font: { family: 'Share Tech Mono', size: 10 }, callback: yCallback }
        }
      }
    }
  });
}


function renderChartLegend(hasSmart, view) {
  const el = $('chart-legend');
  if (!el) return;

  const v = view || state.chartView || 'dollar';
  let items;
  if (v === 'dollar') {
    items = [
      { color: '#ff8c2a', label: 'Std DCA', solid: true },
      ...(hasSmart ? [{ color: '#00e87a', label: 'Optimized', solid: true }] : []),
      { color: 'rgba(255,255,255,0.3)', label: 'Invested', solid: false }
    ];
  } else {
    items = [
      { color: '#a78bfa', label: 'Std Coins', solid: true },
      ...(hasSmart ? [{ color: '#00e87a', label: 'Opt Coins', solid: true }] : [])
    ];
  }

  el.innerHTML = items.map(it => `
    <div class="cl-item">
      <div class="cl-swatch ${it.solid ? '' : 'dashed'}" style="background:${it.solid ? it.color : 'transparent'};border-color:${it.color}"></div>
      <span class="cl-label">${it.label}</span>
    </div>
  `).join('');
}

function renderScrubStats(idx) {
  if (!state.chartData) return;
  const { labels, stdValues, invested, smartValues, stdCoins, smartCoins } = state.chartData;
  if (idx < 0 || idx >= labels.length) return;

  const view     = state.chartView || 'dollar';
  const date     = labels[idx];
  const stdVal   = stdValues[idx];
  const inv      = invested[idx];
  const smartVal = smartValues ? smartValues[idx] : null;
  const stdCoin  = stdCoins  ? stdCoins[idx]  : null;
  const smCoin   = smartCoins ? smartCoins[idx] : null;

  if ($('csb-date')) $('csb-date').textContent = date || '—';

  function card(color, label, bigVal, smallVal, highlight) {
    return '<div class="scrub-card'+(highlight?' scrub-highlight':'')+'">'+
      '<div class="scrub-dot" style="background:'+color+'"></div>'+
      '<div class="scrub-label">'+label+'</div>'+
      '<div class="scrub-big" style="color:'+color+'">'+bigVal+'</div>'+
      (smallVal ? '<div class="scrub-small">'+smallVal+'</div>' : '')+
    '</div>';
  }

  let html = '';

  if (view === 'dollar') {
    const stdROI   = inv > 0 ? ((stdVal - inv) / inv * 100) : 0;
    const smartROI = (smartVal && inv > 0) ? ((smartVal - inv) / inv * 100) : null;
    const diff     = smartVal != null ? smartVal - stdVal : null;
    const stdColor = stdVal >= inv ? '#ff8c2a' : '#ff3a5c';

    html += card('#ff8c2a', 'Std DCA',
      '$'+fmt(stdVal),
      (stdROI>=0?'+':'')+stdROI.toFixed(1)+'% ROI');

    html += card('rgba(255,255,255,0.4)', 'Invested',
      '$'+fmt(inv), '');

    if (smartVal != null) {
      html += card('#00e87a', 'Optimized',
        '$'+fmt(smartVal),
        smartROI != null ? (smartROI>=0?'+':'')+smartROI.toFixed(1)+'% ROI' : '');

      html += card(diff>=0?'#00e87a':'#ff3a5c', 'Difference',
        (diff>=0?'+':'')+' $'+fmt(Math.abs(diff)), '', true);
    }

  } else {
    // Coin view
    const coinDiff = (smCoin != null && stdCoin != null) ? smCoin - stdCoin : null;

    html += card('#a78bfa', 'Std Coins',
      stdCoin != null ? fmtCoins(stdCoin) : '—', '');

    if (smCoin != null) {
      html += card('#00e87a', 'Opt Coins',
        fmtCoins(smCoin), '');

      html += card(coinDiff>=0?'#00e87a':'#ff3a5c', 'More Coins',
        coinDiff != null ? (coinDiff>=0?'+':'')+fmtCoins(Math.abs(coinDiff)) : '—',
        'from optimizing', true);
    }
  }

  const el = $('csb-stats');
  if (el) el.innerHTML = html;
}

function showInitialScrub(view) {
  if (!state.chartData) return;
  const last = state.chartData.labels.length - 1;
  renderScrubStats(last);
}

function wireChartScrub() {
  const container = $('chart-container');
  const crosshair = $('chart-crosshair');
  if (!container || !crosshair) return;

  function onMove(clientX) {
    if (!state.chart || !state.chartData) return;
    const rect = container.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx  = Math.round(pct * (state.chartData.labels.length - 1));

    const chartArea = state.chart.chartArea;
    if (!chartArea) return;
    // Use Chart.js scale.getPixelForValue for exact alignment with rendered data points
    const xScale = state.chart.scales.x;
    const cxPixel = xScale ? xScale.getPixelForValue(idx) : (chartArea.left + (idx / (state.chartData.labels.length - 1)) * (chartArea.right - chartArea.left));
    crosshair.style.left    = Math.round(cxPixel) + 'px';
    crosshair.style.top     = chartArea.top + 'px';
    crosshair.style.height  = (chartArea.bottom - chartArea.top) + 'px';
    crosshair.style.display = 'block';

    renderScrubStats(idx);
  }

  container.addEventListener('mousemove',  e => onMove(e.clientX));
  container.addEventListener('mouseleave', () => { crosshair.style.display = 'none'; });
  container.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e.touches[0].clientX); }, { passive: false });
  container.addEventListener('touchend',   () => { /* keep crosshair visible after touch lift */ });
}

// ============================================
// RENDER: SCORE
// ============================================

// ============================================
// RENDER: STRATEGY REPORT (replaces optimizer + smart DCA)
// Focused on: what to skip, when to go heavy, $ difference
// ============================================
function renderOptimizer(opt, seasonality){
  const el = $('optimizer-content');
  if (!opt) {
    el.innerHTML = `<p class="empty-msg">Run a backtest of 2+ years to generate your Strategy Report.</p>`;
    return;
  }

  const { baseline, best, bStart, bEnd } = opt;
  const diff = best.result.finalValue - baseline.finalValue;
  const pct  = baseline.finalValue > 0 ? (diff / baseline.finalValue) * 100 : 0;
  const pos  = diff >= 0;
  const coinDiff = (best.result.coins||0) - (baseline.coins||0);
  const asset = ASSETS[state.asset];

  // Build a clear, jargon-free month row
  // "Win rate" replaced with plain English: "Up X of Y years"
  function monthRow(m, action, rowClass) {
    const s = seasonality[m];
    const sign = s.avg >= 0 ? '+' : '';
    const upYears = Math.round(s.winRate * s.count / 100);
    const totalYears = s.count;
    const avgCls = s.avg >= 0 ? 'green' : 'red';

    let verdict = '';
    if (rowClass === 'skip-row') {
      verdict = 'Closed positive only ' + upYears + ' of ' + totalYears + ' years — prices tend to be elevated here.';
    } else if (rowClass === 'boost-row') {
      verdict = 'Down ' + (totalYears - upYears) + ' of ' + totalYears + ' years — prices are typically cheaper here. Stack more.';
    } else {
      verdict = upYears + ' of ' + totalYears + ' years positive' + (s.avg > 0 ? ' — slight upward bias.' : ' — mixed history.');
    }

    // Portrait-first: stacked card layout, no wide grid
    return '<div class="sr-month-card '+rowClass+'">' +
      '<div class="srmc-top">' +
        '<div class="srmc-name">'+MONTHS_FULL[m]+'</div>' +
        '<div class="srmc-avg '+avgCls+'">'+sign+s.avg.toFixed(1)+'%</div>' +
      '</div>' +
      '<div class="srmc-action">'+action+'</div>' +
      '<div class="srmc-why">'+verdict+'</div>' +
    '</div>';
  }

  const skipMonthsHtml  = best.skip.map(m => monthRow(m, 'No buy this month', 'skip-row')).join('');
  const boostMonthsHtml = best.boost.map(m => monthRow(m, best.mult+'× your normal amount', 'boost-row')).join('');

  const normalMonths = Array.from({length:12},(_,m)=>m)
    .filter(m => !best.skip.includes(m) && !best.boost.includes(m));
  const normalMonthsHtml = normalMonths.map(m => monthRow(m, 'Standard buy', 'normal-row')).join('');

  el.innerHTML = `
    <div class="sr-header">
      <div class="sr-title-wrap">
        <div class="sr-asset-badge">${asset.icon} ${asset.name}</div>
        <div class="sr-headline">Your Personalized DCA Playbook</div>
        <div class="sr-subhead">Based on ${seasonality[0]?.count||'?'}+ years of historical monthly data</div>
      </div>
    </div>

    <div class="sr-impact-row">
      <div class="sr-impact-card standard">
        <div class="sri-label">Your Strategy — Standard DCA</div>
        <div class="sri-value">$${fmt(baseline.finalValue)}</div>
        <div class="sri-detail">${baseline.roi.toFixed(1)}% ROI · ${baseline.count} buys · $${fmt(baseline.invested)} in</div>
        <div class="sri-coins">₿ ${fmtCoins(baseline.coins)} ${asset.symbol} accumulated</div>
        <div class="sri-period">${bStart} → ${bEnd}</div>
      </div>
      <div class="sr-impact-arrow">
        <div class="sia-line"></div>
        <div class="sia-label">${pos ? 'Optimizing adds' : 'Difference'}</div>
        <div class="sia-amount ${pos?'green':'red'}">${pos?'+':''}$${fmt(Math.abs(diff))}</div>
        <div class="sia-pct ${pos?'green':'red'}">${pos?'+':''}${pct.toFixed(1)}%</div>
        <div class="sia-coin-diff ${pos?'green':'red'}">${coinDiff>=0?'+':''}${fmtCoins(Math.abs(coinDiff))} ${asset.symbol}</div>
        <div class="sia-line"></div>
      </div>
      <div class="sr-impact-card optimized">
        <div class="sri-label">Optimized Strategy ✦</div>
        <div class="sri-value green">$${fmt(best.result.finalValue)}</div>
        <div class="sri-detail">${best.result.roi.toFixed(1)}% ROI · ${best.result.count} buys · $${fmt(best.result.invested)} in</div>
        <div class="sri-coins green">₿ ${fmtCoins(best.result.coins)} ${asset.symbol} accumulated</div>
        <div class="sri-period">${bStart} → ${bEnd}</div>
      </div>
    </div>

    <div class="sr-month-sections">

      <div class="sr-section skip-section">
        <div class="sr-section-header">
          <span class="sr-section-icon">🚫</span>
          <div>
            <div class="sr-section-title">Skip — Price Historically High</div>
            <div class="sr-section-sub">Your dollar buys the least coin. Hold cash for better entries.</div>
          </div>
        </div>
        <div class="sr-months-grid">${skipMonthsHtml}</div>
      </div>

      <div class="sr-section boost-section">
        <div class="sr-section-header">
          <span class="sr-section-icon">⚡</span>
          <div>
            <div class="sr-section-title">Go ${best.mult}× — Price Historically Low</div>
            <div class="sr-section-sub">Your dollar buys the most coin. Stack hard here.</div>
          </div>
        </div>
        <div class="sr-months-grid">${boostMonthsHtml}</div>
      </div>

      <div class="sr-section normal-section">
        <div class="sr-section-header">
          <span class="sr-section-icon">→</span>
          <div>
            <div class="sr-section-title">Standard Buy Months</div>
            <div class="sr-section-sub">Buy your normal amount</div>
          </div>
        </div>
        <div class="sr-months-grid">${normalMonthsHtml}</div>
      </div>

    </div>

    <div class="sr-disclaimer">◈ Strategy derived from historical seasonal patterns. Past performance does not guarantee future results. Not financial advice.</div>
  `;
}

// renderSmartDCA is now absorbed into renderOptimizer — stub kept for compatibility
function renderSmartDCA(standard, smart, opt) { /* handled in renderOptimizer */ }

// ============================================
// RENDER: FORWARD PLANNER
// Shows the next 12 months as an actionable calendar
// "Here's what's coming — here's exactly what to do"
// ============================================
function renderForwardPlanner(seasonality, opt, amount, frequency, assetId) {
  const el = $('planner-content');
  if (!el) return;

  const a = ASSETS[assetId];
  const today = new Date();
  const sym = a.symbol;

  // Build the next 12 months from today
  const freqLabel = frequency === 'daily' ? 'day' : frequency === 'weekly' ? 'week' : 'month';
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const m = d.getMonth();
    const yr = d.getFullYear();
    const s = seasonality[m];
    const isSkip  = opt ? opt.best.skip.includes(m)  : false;
    const isBoost = opt ? opt.best.boost.includes(m) : false;
    const mult    = opt ? opt.best.mult : 1;
    const buyAmt  = isSkip ? 0 : isBoost ? amount * mult : amount;
    const isCurrent = i === 0;
    months.push({ month: m, year: yr, season: s, isSkip, isBoost, mult, buyAmt, isCurrent });
  }

  const totalOptimized = months.reduce((s,m) => s + m.buyAmt, 0);
  const totalStandard  = amount * 12;
  const skippedMonths  = months.filter(m => m.isSkip).length;
  const boostedMonths  = months.filter(m => m.isBoost).length;

  // Build month cards
  const monthCards = months.map(m => {
    const s = m.season;
    const sign = s.avg >= 0 ? '+' : '';
    let actionClass = 'plan-standard';
    let actionLabel = `$${fmt(amount)}`;
    let actionTag   = 'Standard buy';
    let actionIcon  = '→';
    if (m.isSkip)  { actionClass='plan-skip';  actionLabel='$0';              actionTag=`Skip — price historically high`; actionIcon='🚫'; }
    if (m.isBoost) { actionClass='plan-boost'; actionLabel=`$${fmt(m.buyAmt)}`; actionTag=`${m.mult}× — price historically low`; actionIcon='⚡'; }

    const isNow = m.isCurrent;
    const monthName = MONTHS_FULL[m.month];

    return `<div class="plan-month ${actionClass} ${isNow ? 'plan-current' : ''}">
      ${isNow ? '<div class="plan-now-badge">THIS MONTH</div>' : ''}
      <div class="pm-header">
        <div class="pm-month">${MONTHS[m.month]}</div>
        <div class="pm-year">${m.year}</div>
      </div>
      <div class="pm-action-icon">${actionIcon}</div>
      <div class="pm-buy">${actionLabel}</div>
      <div class="pm-tag">${actionTag}</div>
      <div class="pm-stats">
        <span class="pm-avg ${s.avg>=0?'green':'red'}">${sign}${s.avg.toFixed(1)}% avg</span>
      </div>
    </div>`;
  }).join('');

  // "Why this works" explainer - forward framing
  const nextBoost = months.find(m => m.isBoost && !m.isCurrent);
  const nextSkip  = months.find(m => m.isSkip  && !m.isCurrent);
  const thisMonth = months[0];

  let nextActionHtml = '';
  if (thisMonth.isBoost) {
    nextActionHtml = `<div class="plan-alert boost-alert">⚡ <strong>Right now is a historically strong accumulation window.</strong> ${MONTHS_FULL[thisMonth.month]} has averaged ${thisMonth.season.avg >= 0 ? '+' : ''}${thisMonth.season.avg.toFixed(1)}% price movement historically — meaning prices tend to be lower. Go ${thisMonth.mult}× on your buys this month.</div>`;
  } else if (thisMonth.isSkip) {
    nextActionHtml = `<div class="plan-alert skip-alert">🚫 <strong>Consider holding off this month.</strong> ${MONTHS_FULL[thisMonth.month]} has historically been a high-price period (${thisMonth.season.avg >= 0 ? '+' : ''}${thisMonth.season.avg.toFixed(1)}% avg). Your dollar buys less coin now. ${nextBoost ? 'A better entry window is coming in ' + MONTHS_FULL[nextBoost.month] + '.' : ''}</div>`;
  } else if (nextBoost) {
    nextActionHtml = `<div class="plan-alert neutral-alert">→ <strong>Next power-buy window: ${MONTHS_FULL[nextBoost.month]}.</strong> Historically one of the lowest-price months for ${sym}. Plan to go ${nextBoost.mult}× on your buys then.</div>`;
  }

  el.innerHTML = `
    ${nextActionHtml}

    <div class="plan-calendar-wrap">
      <div class="plan-cal-legend">
        <span class="pcl-item boost-leg">⚡ Go ${opt && opt.best ? opt.best.mult+'×' : '2×'} — low-price month</span>
        <span class="pcl-item skip-leg">🚫 Skip — high-price month</span>
        <span class="pcl-item std-leg">→ Standard buy</span>
      </div>
      <div class="plan-grid">${monthCards}</div>
    </div>

    <div class="plan-disclaimer">
      ◈ Based on historical seasonal patterns. Not financial advice.
    </div>
  `;
}


// ============================================
// CURRENT MONTH INDICATOR — free feature
// Shows how the current month is tracking vs its historical average
// ============================================
async function renderCurrentMonthIndicator(seasonality, assetId) {
  const el = $('current-month-indicator');
  if (!el) return;

  const now      = new Date();
  const monthIdx = now.getMonth();
  const monthName= MONTHS_FULL[monthIdx];
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), monthIdx + 1, 0).getDate();
  const pctComplete = Math.round((dayOfMonth / daysInMonth) * 100);

  const s   = seasonality[monthIdx];
  const a   = ASSETS[assetId];
  const sym = a.symbol;

  // Get current month's price change using cached daily data
  let currentRet = null;
  try {
    const daily = await fetchDaily(assetId);
    // Find first price of this month and latest price
    const ym = `${now.getFullYear()}-${pad(monthIdx + 1)}`;
    const monthPrices = daily.dates
      .map((d, i) => ({ d, p: daily.prices[i] }))
      .filter(x => x.d.startsWith(ym));

    if (monthPrices.length >= 2) {
      const open  = monthPrices[0].p;
      const close = monthPrices[monthPrices.length - 1].p;
      currentRet  = ((close - open) / open) * 100;
    }
  } catch (e) { console.warn('CMI data fetch failed:', e.message); }

  const histAvg   = s.avg;
  const histSign  = histAvg >= 0 ? '+' : '';
  const upYears   = Math.round(s.winRate * s.count / 100);

  // Status logic
  let statusClass, statusIcon, statusMsg;

  if (currentRet !== null) {
    const vsAvg = currentRet - histAvg;
    const isAboveAvg = currentRet > histAvg;

    if (currentRet < -5) {
      statusClass = 'cmi-great';
      statusIcon  = '⚡';
      statusMsg   = `Prices are down ${Math.abs(currentRet).toFixed(1)}% this month — your dollar is buying more ${sym} than usual. Historically strong accumulation conditions.`;
    } else if (currentRet < 0) {
      statusClass = 'cmi-good';
      statusIcon  = '✓';
      statusMsg   = `Slight dip this month (${currentRet.toFixed(1)}%). Running below the historical average of ${histSign}${histAvg.toFixed(1)}% — decent time to be buying.`;
    } else if (currentRet < histAvg) {
      statusClass = 'cmi-neutral';
      statusIcon  = '→';
      statusMsg   = `Up ${currentRet.toFixed(1)}% so far but still below ${monthName}'s historical average of ${histSign}${histAvg.toFixed(1)}%. Month has ${100 - pctComplete}% left.`;
    } else {
      statusClass = 'cmi-caution';
      statusIcon  = '↑';
      statusMsg   = `Running ${currentRet.toFixed(1)}% this month — ahead of the historical average (${histSign}${histAvg.toFixed(1)}%). Price is elevated vs seasonal norms.`;
    }
  } else {
    // No current data — show historical context only
    if (histAvg < -2) {
      statusClass = 'cmi-great';
      statusIcon  = '⚡';
      statusMsg   = `${monthName} is historically one of the weakest months (avg ${histSign}${histAvg.toFixed(1)}%) — that means lower prices and more ${sym} per dollar. Good accumulation window.`;
    } else if (histAvg > 5) {
      statusClass = 'cmi-caution';
      statusIcon  = '↑';
      statusMsg   = `${monthName} is historically a strong month (avg ${histSign}${histAvg.toFixed(1)}%) — prices tend to be elevated. Your dollar buys less ${sym}.`;
    } else {
      statusClass = 'cmi-neutral';
      statusIcon  = '→';
      statusMsg   = `${monthName} has mixed historical performance (avg ${histSign}${histAvg.toFixed(1)}%). Standard DCA conditions.`;
    }
  }

  el.style.display = 'block';
  el.innerHTML = `
    <div class="cmi-inner ${statusClass}">
      <div class="cmi-left">
        <div class="cmi-month-wrap">
          <div class="cmi-icon">${statusIcon}</div>
          <div>
            <div class="cmi-month">${monthName} ${now.getFullYear()}</div>
            <div class="cmi-progress-wrap">
              <div class="cmi-progress-bar" style="width:${pctComplete}%"></div>
            </div>
            <div class="cmi-pct-label">${pctComplete}% through the month</div>
          </div>
        </div>
        <div class="cmi-msg">${statusMsg}</div>
      </div>
      <div class="cmi-stats">
        <div class="cmi-stat">
          <div class="cmi-stat-label">This Month</div>
          <div class="cmi-stat-value ${currentRet !== null ? (currentRet >= 0 ? 'green' : 'red') : ''}">${currentRet !== null ? (currentRet >= 0 ? '+' : '') + currentRet.toFixed(1) + '%' : 'Loading...'}</div>
        </div>
        <div class="cmi-stat">
          <div class="cmi-stat-label">Historical Avg</div>
          <div class="cmi-stat-value ${histAvg >= 0 ? 'orange' : 'red'}">${histSign}${histAvg.toFixed(1)}%</div>
        </div>
        <div class="cmi-stat">
          <div class="cmi-stat-label">Historical Record</div>
          <div class="cmi-stat-value">${upYears}/${s.count} yrs up</div>
        </div>
      </div>
    </div>
  `;
}


// ============================================
// CALENDAR LOADER
// ============================================
async function loadCalendar(assetId){
  if(!state.unlockedAssets.has(assetId)){ openUnlockModal(assetId); return; }
  state.calAsset=assetId; state.calYear='all';
  $('panel-calendar').style.display='none';
  $('cal-loading').style.display='flex';
  $('cal-loading-msg').textContent='Loading '+ASSETS[assetId].name+' calendar...';
  try{
    const daily=await fetchDaily(assetId);
    const weekly=await fetchWeekly(assetId);
    const monthly=computeMonthlySeasonality(daily);
    const weeklyS=computeWeeklySeasonality(weekly);
    state.calSeasonality=monthly; state.calWeeklyS=weeklyS;
    $('cal-loading').style.display='none';
    $('panel-calendar').style.display='block';
    buildCalendar(assetId,monthly,weeklyS,daily);
  }catch(e){
    $('cal-loading').style.display='none';
    alert('Failed to load calendar: '+e.message);
  }
}

function buildCalendar(assetId,monthly,weeklyS,daily){
  const a=ASSETS[assetId];
  $('cal-title-icon').textContent=a.icon;
  $('cal-title-name').textContent=a.name;
  $('cal-title-sub').textContent=a.symbol+' — Signal Calendar';
  $('cal-data-range').textContent=daily.dates[0].slice(0,4)+' – '+daily.dates[daily.dates.length-1].slice(0,4)+' · '+(monthly[0]?.count||0)+'+ years of data';

  // View toggle — also update best/worst strip when switching views
  document.querySelectorAll('.view-btn').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.view-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); state.calView=b.dataset.view;
    $('monthly-view').style.display=state.calView==='monthly'?'block':'none';
    $('weekly-view').style.display=state.calView==='weekly'?'block':'none';
    // Update best/worst strip to reflect current view
    if (state.calView==='weekly') {
      renderBestWorstWeekly(weeklyS, state.calYear, daily);
    } else {
      renderBestWorst(monthly, state.calYear);
    }
  }));

  // Year filter
  const years=[...new Set(daily.dates.map(d=>d.slice(0,4)))].sort();
  const fp=$('year-filter-pills');
  fp.innerHTML='<button class="ypill active" data-y="all">All</button>'+years.map(y=>`<button class="ypill" data-y="${y}">${y}</button>`).join('');
  fp.querySelectorAll('.ypill').forEach(b=>b.addEventListener('click',()=>{
    fp.querySelectorAll('.ypill').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); state.calYear=b.dataset.y;
    // Recompute best/worst for the active view
    if (state.calView==='weekly') {
      renderBestWorstWeekly(weeklyS, state.calYear, daily);
    } else {
      renderBestWorst(monthly, state.calYear);
    }
    renderMonthlyHeatmap(monthly,state.calYear);
    renderWeeklyHeatmap(weeklyS,state.calYear,daily);
  }));

  renderBestWorst(monthly, 'all');
  renderMonthlyHeatmap(monthly,'all');
  renderWeeklyHeatmap(weeklyS,'all',daily);
  buildYearlyGrid(daily);
}

function renderBestWorst(monthly, yr) {
  let data = monthly;
  if (yr && yr !== 'all') {
    // Filter to specific year's returns
    data = monthly.map(s => {
      const f = s.years.filter(y => String(y.year) === yr);
      if (!f.length) return { ...s, avg: 0, count: 0 };
      return { ...s, avg: f[0].ret, count: 1 };
    });
  }
  // Only include months with data
  const withData = data.filter(s => s.count > 0);
  if (!withData.length) return;
  const sorted = [...withData].sort((a,b) => b.avg - a.avg);
  const best3  = sorted.slice(0,3);
  const worst3 = sorted.slice(-3).reverse();
  const yearLabel = yr && yr !== 'all' ? ` in ${yr}` : ' historically';
  $('best-worst-strip').innerHTML=`
    <div class="bw-group">
      <div class="bw-group-label green-label">▲ Strongest${yearLabel}</div>
      <div class="bw-cards">
        ${best3.map((m,i)=>`<div class="bw-card bw-best">
          <div class="bw-rank">#${i+1}</div>
          <div class="bw-month">${MONTHS_FULL[m.month]}</div>
          <div class="bw-pct green">+${m.avg>=0?m.avg.toFixed(1):'~'+Math.abs(m.avg).toFixed(1)}%</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="bw-group">
      <div class="bw-group-label red-label">▼ Weakest${yearLabel}</div>
      <div class="bw-cards">
        ${worst3.map((m,i)=>`<div class="bw-card bw-worst">
          <div class="bw-rank">#${sorted.length-2+i}</div>
          <div class="bw-month">${MONTHS_FULL[m.month]}</div>
          <div class="bw-pct red">${m.avg>=0?'+':''}${m.avg.toFixed(1)}%</div>
        </div>`).join('')}
      </div>
    </div>
  `;
}

function renderBestWorstWeekly(weeklyS, yr, daily) {
  // Compute weekly data for the selected year filter
  let data = weeklyS;
  if (yr && yr !== 'all') {
    const yDates  = daily.dates.filter(d => d.startsWith(yr));
    const yPrices = yDates.map(d => daily.prices[daily.dates.indexOf(d)]);
    data = computeWeeklySeasonality({ dates: yDates, prices: yPrices });
  }
  const withData = data.filter(s => s.count > 0);
  if (!withData.length) return;
  const sorted = [...withData].sort((a,b) => b.avg - a.avg);
  const best3  = sorted.slice(0,3);
  const worst3 = sorted.slice(-3).reverse();
  const yearLabel = yr && yr !== 'all' ? ` in ${yr}` : ' historically';
  $('best-worst-strip').innerHTML=`
    <div class="bw-group">
      <div class="bw-group-label green-label">▲ Strongest weeks${yearLabel}</div>
      <div class="bw-cards">
        ${best3.map((s,i)=>`<div class="bw-card bw-best">
          <div class="bw-rank">#${i+1}</div>
          <div class="bw-month">Week ${s.week}</div>
          <div class="bw-pct green">${s.avg>=0?'+':''}${s.avg.toFixed(1)}%</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="bw-group">
      <div class="bw-group-label red-label">▼ Weakest weeks${yearLabel}</div>
      <div class="bw-cards">
        ${worst3.map((s,i)=>`<div class="bw-card bw-worst">
          <div class="bw-rank">#${sorted.length-2+i}</div>
          <div class="bw-month">Week ${s.week}</div>
          <div class="bw-pct red">${s.avg>=0?'+':''}${s.avg.toFixed(1)}%</div>
        </div>`).join('')}
      </div>
    </div>
  `;
}

function renderMonthlyHeatmap(monthly,yr){
  let data=monthly;
  if(yr!=='all'){
    data=monthly.map(s=>{
      const f=s.years.filter(y=>String(y.year)===yr);
      if(!f.length) return{...s,avg:0,winRate:0,count:0,years:[]};
      return{...s,avg:f[0].ret,winRate:f[0].ret>0?100:0,count:1,years:f};
    });
  }
  const maxAbs=Math.max(...data.map(s=>Math.abs(s.avg)),1);
  $('cal-heatmap').innerHTML=data.map((s,m)=>{
    const cls=s.avg>1.5?'pos':s.avg<-1.5?'neg':'neu';
    const sign=s.avg>=0?'+':'';
    const int=Math.min(1,Math.abs(s.avg)/maxAbs);
    return `<div class="hm-cell ${cls}" data-m="${m}" style="--int:${int}">
      <div class="hm-name">${MONTHS[m]}</div>
      <div class="hm-ret">${sign}${s.avg.toFixed(1)}%</div>
      <div class="hm-win" title="Closed positive in ${s.count>0?Math.round(s.winRate*s.count/100)+' of '+s.count+' years':0} years">${s.count>0?Math.round(s.winRate)+'% yrs+':'—'}</div>
      <div class="hm-bar"></div>
    </div>`;
  }).join('');
  $('cal-heatmap').querySelectorAll('.hm-cell').forEach(el=>el.addEventListener('click',()=>showMonthDetail(parseInt(el.dataset.m),data)));
}

function renderWeeklyHeatmap(weeklyS,yr,daily){
  // For year filter on weekly, rebuild from daily data
  let data=weeklyS;
  if(yr!=='all'){
    const yDates=daily.dates.filter(d=>d.startsWith(yr));
    const yPrices=yDates.map(d=>daily.prices[daily.dates.indexOf(d)]);
    const yData={dates:yDates,prices:yPrices};
    data=computeWeeklySeasonality(yData);
  }
  const maxAbs=Math.max(...data.map(s=>Math.abs(s.avg)),1);
  $('weekly-heatmap').innerHTML=data.map(s=>{
    if(!s.count) return `<div class="wk-cell neu" title="Week ${s.week}"><div class="wk-num">W${s.week}</div><div class="wk-ret">—</div></div>`;
    const cls=s.avg>1?'pos':s.avg<-1?'neg':'neu';
    const sign=s.avg>=0?'+':'';
    const int=Math.min(1,Math.abs(s.avg)/maxAbs);
    return `<div class="wk-cell ${cls}" title="Week ${s.week}: avg ${sign}${s.avg.toFixed(2)}% · ${Math.round(s.winRate)}% win rate" style="--int:${int}">
      <div class="wk-num">W${s.week}</div>
      <div class="wk-ret">${sign}${s.avg.toFixed(1)}%</div>
    </div>`;
  }).join('');
}

function showMonthDetail(m,monthly){
  const s=monthly[m]; const sign=s.avg>=0?'+':'';
  const cls=s.avg>1.5?'green':s.avg<-1.5?'red':'';
  $('month-detail-inner').innerHTML=`
    <div class="md-title ${cls}">${MONTHS_FULL[m]}</div>
    <div class="md-stats">
      <div class="md-stat"><div class="md-lbl">Avg Return</div><div class="md-val ${cls}">${sign}${s.avg.toFixed(2)}%</div></div>
      <div class="md-stat"><div class="md-lbl">Median</div><div class="md-val">${s.median!==undefined?(s.median>=0?'+':'')+s.median.toFixed(2)+'%':'N/A'}</div></div>
      <div class="md-stat"><div class="md-lbl">Win Rate</div><div class="md-val">${s.count?Math.round(s.winRate)+'%':'N/A'}</div></div>
      <div class="md-stat"><div class="md-lbl">Volatility</div><div class="md-val">${s.stdDev!==undefined?'±'+s.stdDev.toFixed(1)+'%':'N/A'}</div></div>
      <div class="md-stat"><div class="md-lbl">Best Year</div><div class="md-val green">${s.best?s.best.year+' (+'+s.best.ret.toFixed(1)+'%)':'N/A'}</div></div>
      <div class="md-stat"><div class="md-lbl">Worst Year</div><div class="md-val red">${s.worst?s.worst.year+' ('+s.worst.ret.toFixed(1)+'%)':'N/A'}</div></div>
    </div>
    ${s.years.length?`<div class="md-years"><div class="md-years-title">All Years (${s.count} data points)</div><div class="md-chips">${s.years.map(y=>`<span class="ychip ${y.ret>=0?'pos':'neg'}">${y.year}: ${y.ret>=0?'+':''}${y.ret.toFixed(1)}%</span>`).join('')}</div></div>`:''}
  `;
  $('month-detail-card').style.display='block';
  $('month-detail-card').scrollIntoView({behavior:'smooth',block:'nearest'});
}

function buildYearlyGrid(daily){
  const {dates,prices}=daily;
  const mm={};
  for(let i=0;i<dates.length;i++){
    const [y,mo]=dates[i].split('-').map(Number);
    const k=`${y}-${pad(mo)}`;
    if(!mm[k]) mm[k]={year:y,month:mo-1,first:prices[i],last:prices[i]};
    else mm[k].last=prices[i];
  }
  const years=[...new Set(Object.values(mm).map(v=>v.year))].sort((a,b)=>b-a);
  $('yearly-grid').innerHTML=
    `<div class="yg-row header"><div class="yg-year">Year</div>${MONTHS.map(m=>`<div class="yg-cell hdr">${m}</div>`).join('')}<div class="yg-cell hdr">YTD</div></div>`+
    years.map(y=>{
      const cells=Array.from({length:12},(_,m)=>{
        const e=mm[`${y}-${pad(m+1)}`]; if(!e) return '<div class="yg-cell empty">—</div>';
        const r=((e.last-e.first)/e.first)*100; const s=r>=0?'+':'';
        return `<div class="yg-cell ${r>0?'pos':r<0?'neg':'neu'}" title="${MONTHS_FULL[m]} ${y}: ${s}${r.toFixed(2)}%">${s}${r.toFixed(1)}%</div>`;
      }).join('');
      const jan=mm[`${y}-01`]; const dec=mm[`${y}-12`]||mm[`${y}-11`]||mm[`${y}-10`];
      let ytd='<div class="yg-cell empty">—</div>';
      if(jan&&dec&&jan.first>0){const a=((dec.last-jan.first)/jan.first)*100;ytd=`<div class="yg-cell ${a>0?'pos':'neg'} bold">${a>=0?'+':''}${a.toFixed(0)}%</div>`;}
      return `<div class="yg-row"><div class="yg-year">${y}</div>${cells}${ytd}</div>`;
    }).join('');
}

// ============================================
// WALLET
// ============================================
function openWalletModal(){ state.wallet?renderConnected():renderConnect(); $('modal-backdrop').style.display='flex'; }
function openUnlockModal(id){ state.wallet?renderConfirm(id):renderRequired(id); $('modal-backdrop').style.display='flex'; }
function closeModal(){
  const bd=$('modal-backdrop');
  if(!bd) return;
  bd.style.display='none';
  const inner=$('modal-inner');
  if(inner) inner.innerHTML='';
}

// ============================================
// WALLET — Phantom + Seed Vault Wallet (Seeker)
//
// Phantom flow (Android/Seeker):
//   Inside Phantom browser → window.solana injected → connect directly
//   In Chrome → deep link opens OmenFi inside Phantom browser
//
// Seed Vault Wallet flow (Seeker):
//   Inside Solflare/Seed Vault browser → window.solflare injected → connect directly
//   In Chrome → deep link opens OmenFi inside Solflare browser
//
// Flow on Desktop:
//   Phantom/Solflare extension injects window → connect directly
// ============================================

const IS_ANDROID = /android/i.test(navigator.userAgent);
function isPhantomInjected()   { return !!(window.phantom?.solana?.isPhantom || window.solana?.isPhantom); }
function isSolflareInjected()  { return !!(window.solflare?.isSolflare); }

function renderConnect() {
  const phantomReady  = isPhantomInjected();
  const solflareReady = isSolflareInjected();
  $('modal-inner').innerHTML = `
    <div class="mi-title">Connect Wallet</div>
    <div class="mi-sub">Choose your wallet to get started</div>
    <div class="wallet-opts">
      <button class="wopt wopt-primary" id="cw-phantom">
        <svg width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius:8px;flex-shrink:0">
          <rect width="128" height="128" rx="26" fill="#ab9ff2"/>
          <path d="M100.4 55.4H89.9c-1.2-13.7-12.8-24.4-26.8-24.4-14.8 0-26.8 12-26.8 26.8 0 4.2.9 8.1 2.7 11.7H26.7c-.6-2.4-.9-4.9-.9-7.5 0-20.5 16.6-37.1 37.1-37.1 19.3 0 35.2 14.7 37 33.5z" fill="white"/>
          <ellipse cx="54" cy="69" rx="7" ry="9" fill="#512da8"/>
          <ellipse cx="80" cy="69" rx="7" ry="9" fill="#512da8"/>
          <path d="M47 85c3 6 10 10 17 10s14-4 17-10H47z" fill="#512da8"/>
        </svg>
        <div>
          <b>Phantom</b>
          <span>${phantomReady ? 'Ready to connect' : IS_ANDROID ? 'Opens in Phantom browser' : 'Browser extension'}</span>
        </div>
        <span style="margin-left:auto">→</span>
      </button>
      <button class="wopt" id="cw-seedvault">
        <svg width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius:8px;flex-shrink:0">
          <rect width="128" height="128" rx="22" fill="#1a1a2e"/>
          <rect width="128" height="128" rx="22" fill="url(#svgrad)"/>
          <defs>
            <linearGradient id="svgrad" x1="0" y1="0" x2="128" y2="128" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#ff8c2a"/>
              <stop offset="100%" stop-color="#ff3a5c"/>
            </linearGradient>
          </defs>
          <circle cx="64" cy="54" r="26" fill="none" stroke="white" stroke-width="6"/>
          <circle cx="64" cy="54" r="10" fill="white"/>
          <line x1="28" y1="54" x2="38" y2="54" stroke="white" stroke-width="5" stroke-linecap="round"/>
          <line x1="90" y1="54" x2="100" y2="54" stroke="white" stroke-width="5" stroke-linecap="round"/>
          <rect x="40" y="84" width="48" height="24" rx="6" fill="white" fill-opacity="0.2" stroke="white" stroke-width="3"/>
          <path d="M56 96 L64 90 L72 96 L64 102 Z" fill="white"/>
        </svg>
        <div>
          <b>Seed Vault Wallet</b>
          <span>${solflareReady ? 'Ready to connect' : IS_ANDROID ? 'Opens in Seed Vault browser' : 'Solana Seeker'}</span>
        </div>
        <span style="margin-left:auto">→</span>
      </button>
    </div>
    <p class="mi-note">OmenFi never stores your private keys. Payments verified on-chain.</p>
    <div id="connect-error" style="display:none;color:var(--red);font-family:var(--fm);font-size:.78rem;text-align:center;margin-top:8px;padding:8px;background:rgba(255,58,92,.08);border-radius:6px;border:1px solid rgba(255,58,92,.2)"></div>
  `;
  $('cw-phantom').addEventListener('click',   () => doConnect('phantom'));
  $('cw-seedvault').addEventListener('click', () => doConnect('seedvault'));
}

async function doConnect(walletType = 'phantom') {
  const errEl = $('connect-error');
  const btns  = document.querySelectorAll('#modal-inner .wopt');
  btns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
  if (errEl) errEl.style.display = 'none';

  try {
    if (walletType === 'seedvault') {
      // Seed Vault Wallet — use transact() directly
      // This fires the solana-wallet:// Android intent without triggering
      // Chrome's Local Network Access permission check
      if (!window.mwaTransact) {
        throw new Error('Seed Vault Wallet is only available in Chrome on Android.');
      }

      const web3 = window.solanaWeb3;

      const authResult = await window.mwaTransact(async (wallet) => {
        return await wallet.authorize({
          chain: 'solana:mainnet',
          identity: {
            name: 'OmenFi',
            uri: window.location.origin,
            icon: 'icon-192.png', // must be relative URI per MWA spec
          },
        });
      });

      if (!authResult?.accounts?.[0]?.address) {
        throw new Error('Authorization failed. Please try again.');
      }

      // MWA address can be Uint8Array, base64 string, or base58 string
      // Handle all cases robustly
      const rawAddress = authResult.accounts[0].address;
      let pubkey;
      if (typeof rawAddress === 'string') {
        // Could be base64 encoded bytes or already base58
        try {
          // Try treating as base64 first (common MWA format)
          const bytes = Uint8Array.from(atob(rawAddress), c => c.charCodeAt(0));
          pubkey = new web3.PublicKey(bytes).toBase58();
        } catch(e) {
          // Already a base58 address string
          pubkey = rawAddress;
        }
      } else {
        // Uint8Array or Buffer
        pubkey = new web3.PublicKey(rawAddress).toBase58();
      }
      if (!pubkey || pubkey.length < 32) throw new Error('Invalid public key from wallet.');

      // Store auth token for subsequent signing
      sessionStorage.setItem('mwa_auth_token', authResult.auth_token || '');

      saveWallet(pubkey);
      await onWalletConnected(pubkey, 'seedvault');

    } else {
      // Phantom
      if (isPhantomInjected()) {
        const provider = window.phantom?.solana || window.solana;

        if (provider.publicKey) {
          const pubkey = provider.publicKey.toString();
          saveWallet(pubkey);
          await onWalletConnected(pubkey, 'phantom');
          return;
        }

        sessionStorage.setItem('connecting', '1');
        const resp = await provider.connect();
        sessionStorage.removeItem('connecting');
        const pubkey = resp.publicKey.toString();
        saveWallet(pubkey);
        await onWalletConnected(pubkey, 'phantom');
      } else if (IS_ANDROID) {
        const url = encodeURIComponent(window.location.href);
        window.location.href = `https://phantom.app/ul/browse/${url}?ref=${url}`;
      } else {
        window.open('https://phantom.app', '_blank');
        throw new Error('Phantom not detected. Install the Phantom extension and refresh.');
      }
    }
  } catch (err) {
    btns.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    let msg = err.message || 'Connection failed';
    if (msg.includes('User rejected') || msg.includes('cancelled')) msg = 'Connection cancelled.';
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    console.error('Wallet connect error:', err);
  }
}

async function onWalletConnected(pubkey, provider) {
  // Validate wallet address before storing
  if (!isValidWallet(pubkey)) {
    console.error('Invalid wallet address received:', pubkey);
    return;
  }
  state.wallet         = pubkey;
  state.walletProvider = provider;
  saveWallet(pubkey);         // persist wallet address
  saveWalletProvider(provider); // persist which wallet type
  $('wallet-btn-text').textContent = pubkey.slice(0,4)+'...'+pubkey.slice(-4);
  $('wallet-btn').classList.add('connected');
  await restoreServerUnlocks(pubkey);
  refreshUnlockAllBar();
  const pu = sessionStorage.getItem('pu');
  if (pu) { sessionStorage.removeItem('pu'); renderConfirm(pu); }
  else renderConnected();
}

// Legacy compat
async function connect(){ await doConnect(); }

// ============================================
// PAYMENT — Real SOL transfer + server verification
// ============================================

// Treasury wallet — REPLACE WITH YOUR ACTUAL WALLET ADDRESS
// Set this in Netlify env vars as TREASURY_WALLET too
const TREASURY_WALLET = 'DA15xYbJugwBj7PWT6GQy6GcLYyGTBk46jv6KVAr6xsz';
const UNLOCK_ALL_PRICE = 0.2; // SOL — bundle price for all 11 assets

async function doPayment(id) {
  const btn = $('confirm-pay');
  if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Preparing transaction...'; }

  try {
    const asset = ASSETS[id];
    const lamports = Math.round(asset.price * 1_000_000_000);

    // Get the transaction signature from the wallet
    const signature = await sendSolPayment(id, lamports);

    if (btn) btn.querySelector('span').textContent = 'Verifying payment...';

    // Verify on backend
    const verified = await verifyPaymentOnServer(signature, id, state.wallet);

    if (verified.success) {
      // Store the server-issued unlock token
      storeUnlockToken(id, verified.unlockToken);
      unlockAsset(id);
      renderSuccess(id);
    } else {
      throw new Error(verified.error || 'Verification failed');
    }

  } catch (err) {
    if (btn) { btn.disabled = false; btn.querySelector('span').textContent = `Confirm — Pay ${ASSETS[id].price} SOL`; }
    let msg = err.message || 'Payment failed';
    if (msg.includes('User rejected') || msg.includes('cancelled')) msg = 'Transaction cancelled.';

    // Show error in modal
    const existingErr = $('modal-inner').querySelector('.pay-error');
    if (existingErr) existingErr.remove();
    const errDiv = document.createElement('div');
    errDiv.className = 'pay-error';
    errDiv.style.cssText = 'color:var(--red);font-family:var(--fm);font-size:.78rem;text-align:center;margin-top:8px;padding:8px;background:rgba(255,58,92,.08);border-radius:6px;border:1px solid rgba(255,58,92,.2)';
    errDiv.textContent = msg;
    $('modal-inner').appendChild(errDiv);
    console.error('Payment error:', err, 'msg:', err?.message, 'full:', JSON.stringify(err));
  }
}

// Unlock All — sends 0.2 SOL and unlocks every paid asset
async function doUnlockAll() {
  const btn = $('unlock-all-btn');
  if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Preparing transaction...'; }

  try {
    const lamports = Math.round(UNLOCK_ALL_PRICE * 1_000_000_000);
    const signature = await sendSolPayment('all', lamports);

    if (btn) btn.querySelector('span').textContent = 'Verifying payment...';

    // Verify each asset against the server using the same signature
    const allAssets = Object.keys(ASSETS).filter(id => id !== 'bitcoin');
    let anySuccess = false;

    for (const assetId of allAssets) {
      if (state.unlockedAssets.has(assetId)) continue;
      try {
        const verified = await verifyPaymentOnServer(signature, assetId, state.wallet);
        if (verified.success) {
          storeUnlockToken(assetId, verified.unlockToken);
          unlockAsset(assetId);
          anySuccess = true;
        }
      } catch(e) {
        // If verify fails for one asset, still try the rest
        console.warn('Verify failed for', assetId, e);
      }
    }

    if (anySuccess) {
      // Show success
      const modal = $('modal-inner');
      if (modal) {
        modal.innerHTML = `
          <div class="mi-icon" style="color:var(--green);font-size:3rem">✓</div>
          <div class="mi-title" style="color:var(--green)">All Assets Unlocked!</div>
          <div class="mi-sub">You now have full access to all 11 crypto assets on OmenFi.</div>
          <button class="run-btn" id="close-ok" style="width:100%;margin-top:16px"><span>Start Exploring</span><span>→</span></button>
        `;
        $('close-ok').addEventListener('click', closeModal);
      }
    } else {
      throw new Error('Verification failed — please contact support with your tx signature: ' + signature);
    }

  } catch (err) {
    if (btn) { btn.disabled = false; btn.querySelector('span').textContent = `Unlock All — ${UNLOCK_ALL_PRICE} SOL`; }
    let msg = err.message || 'Payment failed';
    if (msg.includes('User rejected') || msg.includes('cancelled')) msg = 'Transaction cancelled.';
    const existingErr = $('modal-inner').querySelector('.pay-error');
    if (existingErr) existingErr.remove();
    const errDiv = document.createElement('div');
    errDiv.className = 'pay-error';
    errDiv.style.cssText = 'color:var(--red);font-family:var(--fm);font-size:.78rem;text-align:center;margin-top:8px;padding:8px;background:rgba(255,58,92,.08);border-radius:6px;border:1px solid rgba(255,58,92,.2)';
    errDiv.textContent = msg;
    $('modal-inner').appendChild(errDiv);
    console.error('Unlock all error:', err);
  }
}

// Build and send the SOL transfer transaction
// Manually encodes the transaction to avoid web3.js CDN buffer-layout bugs
async function sendSolPayment(assetId, lamports) {
  if (!state.wallet) throw new Error('Wallet not connected');
  // lamports passed directly — assetId may be 'all' for bundle

  // Use whichever wallet the user connected with
  let provider;
  if (state.walletProvider === 'seedvault') {
    // Seed Vault uses MWA transact for signing — handled below
    provider = null; // will use mwaTransact path
  } else {
    provider = window.phantom?.solana || window.solana;
    if (!provider?.isPhantom) throw new Error('Phantom wallet not found. Please install Phantom.');
  }

  const web3 = window.solanaWeb3;
  if (!web3) throw new Error('Solana library not loaded. Please refresh.');

  // RPC proxy keeps Helius key server-side only
  const RPC_PROXY = '/.netlify/functions/rpc-proxy';

  const proxyFetch = async (method, params) => {
    const res = await fetch(RPC_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error('Too many requests — please wait a moment and try again.');
      throw new Error(`Payment service error (${res.status}) — please try again.`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Payment service unavailable — please try again in a moment.');
    }
    const json = await res.json();
    if (json.error) throw new Error(`RPC error: ${json.error.message}`);
    return json.result;
  };

  const connection = new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');

  const blockhashResult = await proxyFetch('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const blockhash = blockhashResult.value.blockhash;
  const lastValidBlockHeight = blockhashResult.value.lastValidBlockHeight;

  // Manually build a minimal SOL transfer transaction as raw bytes
  // This completely bypasses web3.js SystemProgram.transfer and its buffer-layout dependency
  const fromPubkey = new web3.PublicKey(state.wallet);
  const toPubkey   = new web3.PublicKey(TREASURY_WALLET);
  const lamportsInt = Math.round(Number(lamports));

  // Encode lamports as little-endian 8 bytes manually
  function encodeLamports(amount) {
    const buf = new Uint8Array(8);
    let val = amount;
    for (let i = 0; i < 8; i++) {
      buf[i] = val & 0xff;
      val = Math.floor(val / 256);
    }
    return buf;
  }

  // System program transfer instruction layout:
  // [4 bytes: instruction index=2] [8 bytes: lamports little-endian]
  const instrData = new Uint8Array(12);
  instrData[0] = 2; instrData[1] = 0; instrData[2] = 0; instrData[3] = 0; // index = 2
  instrData.set(encodeLamports(lamportsInt), 4);

  // Build the transaction using web3.js Transaction + TransactionInstruction
  // but with our own pre-encoded data (avoids SystemProgram.transfer encoding bug)
  const SYSTEM_PROGRAM_ID = new web3.PublicKey('11111111111111111111111111111111');

  const instruction = new web3.TransactionInstruction({
    keys: [
      { pubkey: fromPubkey, isSigner: true,  isWritable: true  },
      { pubkey: toPubkey,   isSigner: false, isWritable: true  },
    ],
    programId: SYSTEM_PROGRAM_ID,
    data: instrData,
  });

  // Memo instruction — permanent on-chain receipt for this purchase
  // Format: omenfi:<assetId>  e.g. omenfi:ethereum, omenfi:all, omenfi:tip
  // Recovery reads this memo to know exactly which asset was purchased
  const MEMO_PROGRAM_ID = new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  const memoText = 'omenfi:' + assetId;
  const memoInstruction = new web3.TransactionInstruction({
    keys: [{ pubkey: fromPubkey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoText, 'utf8'),
  });

  const transaction = new web3.Transaction({
    recentBlockhash: blockhash,
    feePayer: fromPubkey,
  });
  transaction.add(instruction);
  transaction.add(memoInstruction);

  let signature;
  try {
    if (state.walletProvider === 'seedvault') {
      // Seed Vault Wallet — sign and send via MWA transact
      const storedAuth = JSON.parse(sessionStorage.getItem('mwa_auth_token') || '{}');

      const result = await window.mwaTransact(async (mwaWallet) => {
        // Re-authorize if needed using stored auth token
        if (storedAuth.token) {
          try {
            await mwaWallet.reauthorize({
              auth_token: storedAuth.token,
              identity: { name: 'OmenFi', uri: window.location.origin, icon: 'icon-192.png' },
            });
          } catch(e) {
            // Auth token expired — user will need to reconnect
            console.warn('Reauth failed, proceeding without token:', e);
          }
        }

        // Serialize the transaction and send to Seed Vault for signing + broadcast
        const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
        const results = await mwaWallet.signAndSendTransactions({
          transactions: [serialized],
          options: { minContextSlot: 0 },
        });
        const sig = results.signatures[0];
        console.log('MWA sig type:', typeof sig, sig instanceof Uint8Array ? 'Uint8Array' : '', 'value:', JSON.stringify(sig)?.slice(0,50));
        return sig;
      });

      console.log('MWA result type:', typeof result, result instanceof Uint8Array ? 'Uint8Array' : Array.isArray(result) ? 'Array' : '', JSON.stringify(result)?.slice(0,80));
      // MWA signAndSendTransactions returns signatures as Uint8Array
      // Convert Uint8Array directly to base58 string
      const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      function toBase58(bytes) {
        let num = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join(''));
        let encoded = '';
        while (num > 0n) { encoded = BASE58_ALPHABET[Number(num % 58n)] + encoded; num = num / 58n; }
        for (const byte of bytes) { if (byte === 0) encoded = '1' + encoded; else break; }
        return encoded;
      }

      // result can be Uint8Array, base64 string, or already base58
      let sigBytes;
      if (result instanceof Uint8Array) {
        sigBytes = result;
      } else if (typeof result === 'string') {
        // Check if it looks like base58 already (all base58 chars, ~88 chars)
        if (/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(result)) {
          signature = result; // already base58
          sigBytes = null;
        } else {
          // Try base64 decode
          try { sigBytes = Uint8Array.from(atob(result), c => c.charCodeAt(0)); }
          catch(e) { signature = result; sigBytes = null; } // use as-is
        }
      } else if (result && typeof result === 'object') {
        sigBytes = new Uint8Array(Object.values(result));
      }

      if (sigBytes) signature = toBase58(sigBytes);

    } else {
      // Phantom — use existing signAndSendTransaction
      const result = await provider.signAndSendTransaction(transaction);
      signature = result.signature || result;
    }
  } catch (err) {
    // Log the full error object so we can see what MWA actually returns
    console.error('sendSolPayment raw error:', JSON.stringify(err), 'message:', err?.message, 'code:', err?.code, 'type:', typeof err);
    if (err.code === 4001 || err.message?.includes('User rejected') || err.message?.includes('cancelled')) {
      throw new Error('Transaction cancelled.');
    }
    // Convert empty objects or non-Error throws to readable messages
    const msg = err?.message || err?.errorMessage || err?.error || JSON.stringify(err);
    throw new Error('Payment failed: ' + (msg || 'Unknown error from wallet'));
  }

  if (!signature) throw new Error('No signature returned from wallet.');
  console.log('Final signature:', signature, 'length:', signature?.length, 'valid base58:', /^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature || ''));

  let confirmed = false;
  for (let i = 0; i < 30; i++) {
    const statusResult = await proxyFetch('getSignatureStatuses', [[signature]]);
    const status = statusResult?.value?.[0];
    if (status && !status.err && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
      confirmed = true; break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!confirmed) throw new Error('Transaction confirmation timed out. Please check your wallet.');
  return signature;
}

// Verify payment with the Netlify serverless function
async function verifyPaymentOnServer(signature, assetId, walletAddress) {
  const res = await fetch('/.netlify/functions/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, assetId, walletAddress }),
  });

  // Always parse as text first to catch non-JSON responses
  const text = await res.text();

  // Detect JWT or non-JSON error
  if (text.startsWith('eyJ') || !text.startsWith('{')) {
    if (res.status === 429) throw new Error('Too many requests — please wait a moment and try again.');
    throw new Error(`Server error (${res.status}) — please try again.`);
  }

  const data = JSON.parse(text);

  // Check for error in response body
  if (data.error) throw new Error(data.error);

  return data;
}

// Store HMAC-signed unlock token in localStorage
function storeUnlockToken(assetId, token) {
  try {
    const stored = JSON.parse(localStorage.getItem('omenfi_v5_tokens') || '{}');
    stored[assetId] = token;
    localStorage.setItem('omenfi_v5_tokens', JSON.stringify(stored));
  } catch(e) {
    console.warn('Could not store unlock token:', e);
  }
}

// On load, re-validate stored tokens against server
async function restoreServerUnlocks(walletAddress) {
  // Always restore from simple localStorage first (catches pre-token purchases)
  restoreLocalUnlocks();

  try {
    const stored = JSON.parse(localStorage.getItem('omenfi_v5_tokens') || '{}');
    const tokens = Object.values(stored).filter(Boolean);

    if (tokens.length) {
      // Has stored tokens — validate them
      console.log('Validating', tokens.length, 'stored tokens for', Object.keys(stored).join(', '));
      const res = await fetch('/.netlify/functions/validate-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: stored }),
      });
      if (!res.ok) {
        console.warn('validate-tokens failed:', res.status);
        return;
      }
      const data = await res.json();
      console.log('Valid assets from server:', data.validAssets);
      (data.validAssets || []).forEach(id => state.unlockedAssets.add(id));
      refreshAssetUI();
      refreshUnlockAllBar();
    } else {
      // No stored tokens — scan blockchain
      console.log('No tokens stored — scanning blockchain for', walletAddress);
      const res = await fetch('/.netlify/functions/recover-unlocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      if (!res.ok) {
        console.warn('recover-unlocks failed:', res.status, await res.text());
        return;
      }
      const data = await res.json();
      console.log('Recovery response:', JSON.stringify(data).slice(0, 200));
      const payments = data.payments || [];
      if (!payments.length) {
        console.log('No payments found on blockchain for this wallet');
        return;
      }

      let recovered = 0;

      // New format: each payment has tokensByAsset = {ethereum: token, ripple: token, ...}
      // This maps directly from the memo on each transaction
      for (const payment of payments) {
        const tokensByAsset = payment.tokensByAsset || {};
        console.log('Recovering assets:', Object.keys(tokensByAsset).join(', '));
        for (const [assetId, token] of Object.entries(tokensByAsset)) {
          if (state.unlockedAssets.has(assetId)) continue; // already unlocked
          storeUnlockToken(assetId, token);
          state.unlockedAssets.add(assetId);
          recovered++;
          console.log('Recovered:', assetId);
        }
      }

      if (recovered > 0) {
        saveUnlocked();
        refreshAssetUI();
        refreshUnlockAllBar();
        console.log('Total recovered:', recovered, 'asset(s)');
      } else {
        console.warn('No recoverable assets found — no OmenFi memo transactions detected');
      }
    }
  } catch (e) {
    console.warn('Could not restore unlocks:', e);
    restoreLocalUnlocks();
  }
}

// Fallback: restore from simple localStorage (dev/offline mode)
function restoreLocalUnlocks() {
  try {
    const saved = localStorage.getItem('omenfi_v5_unlocked');
    if (saved) {
      JSON.parse(saved).forEach(id => {
        if (ASSETS[id]) state.unlockedAssets.add(id);
      });
      refreshAssetUI();
      refreshUnlockAllBar();
    }
  } catch(e) {}
}

// ============================================
// MODAL RENDERS
// ============================================

function renderRequired(id){
  const a=ASSETS[id];
  $('modal-inner').innerHTML=`
    <div class="mi-icon">${a.logo ? '<img src="'+a.logo+'" alt="'+a.symbol+'" style="width:64px;height:64px;object-fit:contain;border-radius:50%;background:rgba(255,255,255,0.06);">' : '<span style="color:'+a.color+'">'+a.icon+'</span>'}</div>
    <div class="mi-title">Unlock ${a.name}</div>
    <div class="mi-sub">Connect your wallet to unlock full <strong>${a.symbol}</strong> access.</div>
    <div class="unlock-features">
      <div class="uf-item">📅 Monthly &amp; Weekly Signal Calendar</div>
      <div class="uf-item">📈 DCA Backtester with real price history</div>
      <div class="uf-item">⚡ Strategy Optimizer — skip &amp; boost months</div>
      <div class="uf-item">🗓 12-Month Forward Planner</div>
      <div class="uf-item">🪙 Coin accumulation tracking</div>
    </div>
    <div class="unlock-box"><span class="unlock-price">${a.price} SOL</span><span class="unlock-note">one-time · never expires</span></div>
    <button class="run-btn" id="modal-cw" style="width:100%;margin-top:12px"><span>Connect Wallet</span><span>→</span></button>
  `;
  $('modal-cw').addEventListener('click',()=>{ sessionStorage.setItem('pu',id); renderConnect(); });
}

function renderConfirm(id){
  const a=ASSETS[id]; const sh=state.wallet.slice(0,4)+'...'+state.wallet.slice(-4);
  $('modal-inner').innerHTML=`
    <div class="mi-icon">${a.logo ? '<img src="'+a.logo+'" alt="'+a.symbol+'" style="width:64px;height:64px;object-fit:contain;border-radius:50%;background:rgba(255,255,255,0.06);">' : '<span style="color:'+a.color+'">'+a.icon+'</span>'}</div>
    <div class="mi-title">Unlock ${a.name}</div>
    <div class="mi-sub">Pay <strong>${a.price} SOL</strong> from <span style="color:var(--accent)">${sh}</span> for lifetime ${a.symbol} access.</div>
    <div class="unlock-box">
      <span class="unlock-price">${a.price} SOL</span>
      <div class="unlock-includes">
        <div>✓ Monthly &amp; Weekly Signals</div>
        <div>✓ DCA Backtester</div>
        <div>✓ Strategy Optimizer</div>
        <div>✓ Forward Planner</div>
        <div>✓ Coin Accumulation Tracking</div>
      </div>
    </div>
    <button class="run-btn" id="confirm-pay" style="width:100%;margin-top:12px"><span>Confirm — Pay ${a.price} SOL</span><span>→</span></button>
    <button class="sec-btn" id="cancel-pay" style="margin-top:8px">Cancel</button>
  `;
  $('confirm-pay').addEventListener('click',()=>doPayment(id));
  $('cancel-pay').addEventListener('click',closeModal);
}

function renderConnected(){
  const sh=state.wallet.slice(0,6)+'...'+state.wallet.slice(-4);
  const owned=[...state.unlockedAssets].filter(a=>a!=='bitcoin');
  $('modal-inner').innerHTML=`
    <div class="mi-icon">◎</div>
    <div class="mi-title">Connected</div>
    <div class="wallet-addr"><span class="wa-dot"></span><span>${sh}</span></div>
    <div class="mi-sub" style="margin-top:8px">Unlocked: <strong style="color:var(--accent)">${owned.length?owned.map(a=>ASSETS[a]?.symbol).join(', '):'None yet'}</strong></div>
    <div class="asset-unlock-list">
      ${Object.entries(ASSETS).filter(([id])=>id!=='bitcoin').map(([id,a])=>{
        const u=state.unlockedAssets.has(id);
        return `<div class="aul-row ${u?'owned':''}">
          <img src="${a.logo}" alt="${a.symbol}" style="width:24px;height:24px;border-radius:50%;object-fit:contain;">
          <span class="aul-name">${a.name}</span>
          <span class="aul-status">${u?'✓ OWNED':a.price+' SOL'}</span>
          ${u?'':'<button class="aul-btn" data-id="'+id+'">Unlock</button>'}
        </div>`;
      }).join('')}
    </div>
    <button class="run-btn" id="unlock-all-btn" style="width:100%;margin-top:14px;font-size:0.78rem"><span>Unlock All Assets — ${UNLOCK_ALL_PRICE} SOL</span><span>→</span></button>
    <p style="font-size:0.62rem;color:var(--t3);text-align:center;margin:6px 0 10px;font-family:var(--fb)">Save ${((Object.keys(ASSETS).filter(id=>id!=='bitcoin').length * 0.05) - UNLOCK_ALL_PRICE).toFixed(2)} SOL vs buying individually</p>
    <button class="sec-btn" id="disconnect" style="margin-top:4px">Disconnect</button>
  `;
  document.querySelectorAll('.aul-btn').forEach(b=>b.addEventListener('click',()=>{ closeModal(); openUnlockModal(b.dataset.id); }));
  const unlockAllBtn = $('unlock-all-btn');
  if (unlockAllBtn) {
    // Hide button if everything already unlocked
    const allPaid = Object.keys(ASSETS).filter(id => id !== 'bitcoin');
    const allOwned = allPaid.every(id => state.unlockedAssets.has(id));
    if (allOwned) {
      unlockAllBtn.style.display = 'none';
      const saveNote = unlockAllBtn.nextElementSibling;
      if (saveNote) saveNote.style.display = 'none';
    } else {
      unlockAllBtn.addEventListener('click', () => doUnlockAll());
    }
  }
  $('disconnect').addEventListener('click',()=>{
    state.wallet=null; state.walletProvider=null;
    saveWallet(null);
    saveWalletProvider(null); // clear persisted wallet type
    $('wallet-btn-text').textContent='Connect';
    $('wallet-btn').classList.remove('connected');
    closeModal();
  });
}

// ============================================
// TIP JAR
// ============================================

function openTipModal() {
  const modal = $('modal-inner');
  if (!modal) return;

  // Default selected amount
  let tipAmount = 0.05;

  modal.innerHTML = `
    <div class="mi-icon" style="font-size:2rem">☕</div>
    <div class="mi-title">Leave a Tip</div>
    <div class="mi-sub">If OmenFi has helped your stacking strategy, a small tip keeps the project going.</div>
    <div style="display:flex;gap:8px;width:100%;margin-top:4px">
      <button class="tip-preset" data-amt="0.01">0.01 SOL</button>
      <button class="tip-preset active-tip" data-amt="0.05">0.05 SOL</button>
      <button class="tip-preset" data-amt="0.1">0.1 SOL</button>
    </div>
    <div id="tip-error" style="display:none;color:var(--red);font-size:0.72rem;margin-top:4px;text-align:center;font-family:var(--fm)"></div>
    <button class="run-btn" id="tip-send-btn" style="width:100%;margin-top:8px">
      <span>Send 0.05 SOL</span><span>→</span>
    </button>
    <button class="sec-btn" id="tip-cancel-btn" style="margin-top:8px">Cancel</button>
  `;

  $('modal-backdrop').style.display = 'flex';

  // Style presets and handle selection
  document.querySelectorAll('.tip-preset').forEach(btn => {
    const isActive = btn.classList.contains('active-tip');
    btn.style.cssText = `background:\${isActive?'rgba(255,140,42,0.15)':'var(--bg3)'};border:1px solid \${isActive?'rgba(255,140,42,0.6)':'var(--b)'};border-radius:var(--rs);padding:10px 0;color:\${isActive?'rgba(255,140,42,1)':'var(--t2)'};font-family:var(--fm);font-size:0.78rem;font-weight:600;cursor:pointer;transition:all 0.15s;flex:1;text-align:center`;
    btn.addEventListener('click', () => {
      tipAmount = parseFloat(btn.dataset.amt);
      document.querySelectorAll('.tip-preset').forEach(b => {
        b.style.background = 'var(--bg3)';
        b.style.borderColor = 'var(--b)';
        b.style.color = 'var(--t2)';
      });
      btn.style.background = 'rgba(255,140,42,0.15)';
      btn.style.borderColor = 'rgba(255,140,42,0.6)';
      btn.style.color = 'rgba(255,140,42,1)';
      $('tip-send-btn').querySelector('span').textContent = `Send ${tipAmount} SOL`;
    });
  });

  $('tip-send-btn').addEventListener('click', () => doTip(tipAmount));
  $('tip-cancel-btn').addEventListener('click', closeModal);
}

async function doTip(amount) {
  // amount comes from a hardcoded preset — not user input
  // Whitelist check as final safety net
  const ALLOWED = [0.01, 0.05, 0.1];
  if (!ALLOWED.includes(amount)) return;
  if (!state.wallet) {
    const e = $('tip-error');
    if (e) { e.textContent = 'Please connect your wallet first.'; e.style.display = 'block'; }
    return;
  }

  const btn = $('tip-send-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Sending...';

  try {
    const lamports = Math.round(amount * 1_000_000_000);
    await sendSolPayment('tip', lamports);

    $('modal-inner').innerHTML = `
      <div class="mi-icon" style="color:var(--green);font-size:2.5rem">✓</div>
      <div class="mi-title" style="color:var(--green)">Thank you!</div>
      <div class="mi-sub">Your tip of ${amount} SOL means a lot. It helps keep OmenFi running and improving.</div>
      <button class="sec-btn" id="tip-ok" style="margin-top:16px;width:100%">Close</button>
    `;
    $('tip-ok').addEventListener('click', closeModal);

  } catch (err) {
    btn.disabled = false;
    btn.querySelector('span').textContent = `Send ${amount} SOL`;
    const errEl = $('tip-error');
    let msg = err.message || 'Transaction failed.';
    if (msg.includes('User rejected') || msg.includes('cancelled')) msg = 'Transaction cancelled.';
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }
}

function renderSuccess(id){
  const a=ASSETS[id];
  $('modal-inner').innerHTML=`
    <div class="mi-icon" style="color:var(--green);font-size:3rem">✓</div>
    <div class="mi-title" style="color:var(--green)">Unlocked!</div>
    <div class="mi-sub">${a.name} (${a.symbol}) is now fully unlocked.</div>
    <button class="run-btn" id="goto-cal" style="width:100%;margin-top:16px"><span>View ${a.symbol} Calendar</span><span>→</span></button>
    <button class="sec-btn" id="close-ok" style="margin-top:8px">Close</button>
  `;
  $('goto-cal').addEventListener('click',()=>{ closeModal(); switchTab('calendar'); const b=document.querySelector('#cal-asset-grid [data-id="'+id+'"]'); if(b){document.querySelectorAll('#cal-asset-grid .cal-asset-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');loadCalendar(id);} });
  $('close-ok').addEventListener('click',closeModal);
}

// Legacy connect removed — use doConnect() directly

// ============================================
// UI HELPERS
// ============================================
function showLoad(on){ $('loading-state').style.display=on?'flex':'none'; $('run-btn').disabled=on; $('run-btn').style.opacity=on?'0.45':'1'; }
function setMsg(m){ $('loading-msg').textContent=m; }
function showErr(m){ $('error-msg').textContent=m; $('error-state').style.display='flex'; showLoad(false); }
function clearErr(){ $('error-state').style.display='none'; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function fmt(n){
  if(n==null||isNaN(n)) return '—';
  const abs = Math.abs(n);
  if(abs>=1e9) return (n/1e9).toFixed(2)+'B';
  if(abs>=1e6) return (n/1e6).toFixed(2)+'M';
  return Math.round(n).toLocaleString('en-US');
}
function fmtK(n){
  if(Math.abs(n)>=1e6) return (n/1e6).toFixed(1)+'M';
  if(Math.abs(n)>=1e3) return (n/1e3).toFixed(0)+'K';
  return n.toFixed(0);
}

function fmtCoins(n){
  if(!n||isNaN(n)) return '—';
  if(n>=1000) return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});
  return n.toFixed(8);
}
