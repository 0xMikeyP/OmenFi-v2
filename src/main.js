// OmenFi v2 — Entry Point
// Imports all dependencies via npm (no CDN scripts needed)

import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

// Make libraries globally available
window.solanaWeb3 = web3
window.Chart = Chart

// Mobile Wallet Adapter for web browsers (Android Chrome)
// Uses SolanaMobileWalletAdapter which correctly handles the
// solana-wallet:// intent protocol and WebSocket lifecycle
try {
  const { SolanaMobileWalletAdapter, createDefaultAuthorizationResultCache, createDefaultAddressSelector } =
    await import('@solana-mobile/wallet-adapter-mobile')

  // Create the adapter instance
  const mwaAdapter = new SolanaMobileWalletAdapter({
    addressSelector: createDefaultAddressSelector(),
    appIdentity: {
      name: 'OmenFi',
      uri: window.location.origin,
      icon: `${window.location.origin}/icon-192.png`,
    },
    authorizationResultCache: createDefaultAuthorizationResultCache(),
    chain: 'solana:mainnet',
    onWalletNotFound: () => {
      // Wallet not found — show helpful message instead of redirecting to store
      console.warn('No MWA wallet found')
    },
  })

  window.mwaAdapter = mwaAdapter
  console.log('MWA adapter ready — Seed Vault Wallet available')
} catch (e) {
  console.log('MWA adapter not available:', e.message)
  window.mwaAdapter = null
}

// Load the main app
import './app.js'
