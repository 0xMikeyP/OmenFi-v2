// OmenFi v2 — Entry Point
import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

window.solanaWeb3 = web3
window.Chart = Chart

// Mobile Wallet Adapter — use transact directly
// The adapter class triggers a permissions.query for localhost which
// Chrome blocks with "Local Network Access" error on Android
// Using transact directly bypasses this check
try {
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js')
  window.mwaTransact = transact
  console.log('MWA transact ready')
} catch (e) {
  console.log('MWA not available:', e.message)
  window.mwaTransact = null
}

import './app.js'
