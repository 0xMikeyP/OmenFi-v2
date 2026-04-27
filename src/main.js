// OmenFi v2 — Entry Point
// Imports all dependencies via npm (no CDN scripts needed)

import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

// Make libraries globally available — app.js references them as globals
window.solanaWeb3 = web3
window.Chart = Chart

// Mobile Wallet Adapter — only available/useful on Android
// Import dynamically so it doesn't break on desktop if unavailable
try {
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js')
  window.mwaTransact = transact
  console.log('MWA loaded: transact available')
} catch (e) {
  console.log('MWA not available:', e.message)
  window.mwaTransact = null
}

window.mwaAdapter = null

import './app.js'
