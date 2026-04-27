// OmenFi v2 — Entry Point

import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'

// Make libraries globally available
window.solanaWeb3 = web3
window.Chart = Chart
window.mwaTransact = transact  // Low-level MWA transact — works on Seeker

// Null out mwaAdapter so app.js always uses mwaTransact path
window.mwaAdapter = null

import './app.js'
