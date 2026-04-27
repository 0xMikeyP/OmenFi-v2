// OmenFi v2 — Entry Point

import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

window.solanaWeb3 = web3
window.Chart = Chart

// MWA v2.3.0+ uses a new association mechanism that avoids Chrome's
// Private Network Access dialog freeze. The key change is using
// startSession() with a reflector URL instead of localhost WebSocket.
try {
  // Try the newer API first (v2.3.0+)
  const mwaModule = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js')
  
  if (mwaModule.transact) {
    window.mwaTransact = mwaModule.transact
    console.log('MWA loaded: transact available')
  }
  
  // Also expose the raw module for version detection
  window.mwaModule = mwaModule
} catch (e) {
  console.warn('MWA not available:', e.message)
  window.mwaTransact = null
  window.mwaModule = null
}

window.mwaAdapter = null

import './app.js'
