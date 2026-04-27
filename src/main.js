// OmenFi v2 — Entry Point

import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

// Make libraries globally available
window.solanaWeb3 = web3
window.Chart = Chart

// Mobile Wallet Adapter for web browsers (Android Chrome / Seeker PWA)
// SolanaMobileWalletAdapter correctly handles the solana-wallet:// intent
// and does NOT trigger Chrome's Local Network Access permission dialog
try {
  const {
    SolanaMobileWalletAdapter,
    createDefaultAuthorizationResultCache,
    createDefaultAddressSelector,
  } = await import('@solana-mobile/wallet-adapter-mobile')

  const mwaAdapter = new SolanaMobileWalletAdapter({
    addressSelector: createDefaultAddressSelector(),
    appIdentity: {
      name: 'OmenFi',
      uri: 'https://omenfi.com',
      icon: 'https://omenfi.com/icon-192.png',
    },
    authorizationResultCache: createDefaultAuthorizationResultCache(),
    chain: 'solana:mainnet',
    onWalletNotFound: () => {
      console.warn('No MWA wallet found on this device')
    },
  })

  window.mwaAdapter = mwaAdapter
  // Keep mwaTransact as null so app.js knows to use mwaAdapter instead
  window.mwaTransact = null
} catch (e) {
  console.log('MWA adapter not available:', e.message)
  window.mwaAdapter = null
  window.mwaTransact = null
}

import './app.js'
