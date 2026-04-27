// OmenFi v2 — Entry Point

import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

window.solanaWeb3 = web3
window.Chart = Chart

// Use SolanaMobileWalletAdapter — correct high-level adapter for web browsers
// Does NOT freeze Chrome's UI unlike the low-level transact()
try {
  const {
    SolanaMobileWalletAdapter,
    createDefaultAuthorizationResultCache,
    createDefaultAddressSelector,
    createDefaultWalletNotFoundHandler,
  } = await import('@solana-mobile/wallet-adapter-mobile')

  const adapter = new SolanaMobileWalletAdapter({
    addressSelector: createDefaultAddressSelector(),
    appIdentity: {
      name: 'OmenFi',
      uri: 'https://omenfi.com',
      icon: '/icon-192.png',  // relative path as per MWA spec
    },
    authorizationResultCache: createDefaultAuthorizationResultCache(),
    chain: 'solana:mainnet',
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  })

  window.mwaAdapter = adapter
  window.mwaTransact = null // explicitly null — app.js checks mwaAdapter first

} catch (e) {
  console.warn('MWA adapter failed to load:', e.message)
  window.mwaAdapter = null
  window.mwaTransact = null
}

import './app.js'
