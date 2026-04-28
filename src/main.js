// OmenFi v2 — Entry Point
import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

window.solanaWeb3 = web3
window.Chart = Chart
window.mwaAdapter = null
window.mwaTransact = null

// For vanilla JS web apps, use transact() from the protocol-web3js package
// SolanaMobileWalletAdapter is designed for React context (wallet-adapter-react)
// transact() gives direct control: authorize + sign in one session
try {
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js')
  window.mwaTransact = transact
  console.log('MWA transact ready')
} catch(e) {
  console.log('MWA not available:', e.message)
  window.mwaTransact = null
}

import './app.js'
