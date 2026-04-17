// OmenFi v2 — Entry Point
// Imports all dependencies via npm (no CDN scripts needed)

import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

// Make libraries globally available
window.solanaWeb3 = web3
window.Chart = Chart

// Register Mobile Wallet Adapter as a wallet standard
// This is the official approach per docs.solanamobile.com/get-started/web/installation
// Once registered, MWA appears as a wallet option on Android Chrome automatically
// and handles the solana-wallet:// intent + WebSocket lifecycle correctly
try {
  const {
    registerMwa,
    createDefaultAuthorizationCache,
    createDefaultChainSelector,
    createDefaultWalletNotFoundHandler,
  } = await import('@solana-mobile/wallet-standard-mobile')

  registerMwa({
    appIdentity: {
      name: 'OmenFi',
      uri: window.location.origin,
      icon: `${window.location.origin}/icon-192.png`,
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ['solana:mainnet'],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  })

  console.log('MWA registered — Seed Vault Wallet available on Android')

  // After registering, the wallet standard exposes the MWA wallet
  // via window.navigator.wallets — get a reference for our connect flow
  const getWallets = (await import('@wallet-standard/app')).getWallets
  window.mwaGetWallets = getWallets

} catch (e) {
  console.log('MWA registration skipped (not Android or package unavailable):', e.message)
  window.mwaGetWallets = null
}

// Load the main app
import './app.js'
