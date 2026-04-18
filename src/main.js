// OmenFi v2 — Entry Point
import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'

// Set globals immediately — app.js reads these at DOMContentLoaded
// which fires after this module executes, so order is guaranteed
window.solanaWeb3 = web3
window.Chart = Chart
window.mwaTransact = transact

// Import app.js last — it registers DOMContentLoaded listeners
// which won't fire until all module code has run
import './app.js'
