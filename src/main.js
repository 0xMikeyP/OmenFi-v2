// OmenFi v2 — Entry Point
import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

window.solanaWeb3 = web3
window.Chart = Chart

// Mobile Wallet Adapter for web — using wallet-adapter-mobile
// This is the confirmed working package for Android Chrome + Seed Vault
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
      uri: window.location.origin,
      icon: `${window.location.origin}/icon-192.png`,
    },
    authorizationResultCache: createDefaultAuthorizationResultCache(),
    cluster: 'mainnet-beta',
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  })

  window.mwaAdapter = adapter
  console.log('MWA adapter ready')
} catch (e) {
  console.log('MWA not available:', e.message)
  window.mwaAdapter = null
}

import './app.js'
