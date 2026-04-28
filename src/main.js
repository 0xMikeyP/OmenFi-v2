// OmenFi v2 — Entry Point
import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

window.solanaWeb3 = web3
window.Chart = Chart

// MWA: use transact() directly from the protocol package
// SolanaMobileWalletAdapter triggers Chrome's "Local Network Access Split
// permissions are not enabled" error on the Seeker — transact() bypasses it
try {
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js')
  window.mwaTransact = transact
  console.log('MWA transact ready')
} catch (e) {
  console.log('MWA not available:', e.message)
  window.mwaTransact = null
}

window.mwaAdapter = null

import './app.js'
