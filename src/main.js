// OmenFi v2 — Entry Point
// Per official Solana Mobile docs (docs.solanamobile.com/developers/mobile-wallet-adapter-web):
// Web browsers on Android Chrome must use SolanaMobileWalletAdapter from
// @solana-mobile/wallet-adapter-mobile — NOT the raw transact() function.
// transact() is for React Native native apps only.

import * as web3 from '@solana/web3.js'
import Chart from 'chart.js/auto'

window.solanaWeb3 = web3
window.Chart = Chart
window.mwaAdapter = null
window.mwaTransact = null

try {
  const {
    SolanaMobileWalletAdapter,
    createDefaultAuthorizationResultCache,
    createDefaultAddressSelector,
    createDefaultWalletNotFoundHandler,
  } = await import('@solana-mobile/wallet-adapter-mobile')

  window.mwaAdapter = new SolanaMobileWalletAdapter({
    addressSelector: createDefaultAddressSelector(),
    appIdentity: {
      name: 'OmenFi',
      uri: 'https://omenfi.com',
      icon: 'icon-192.png', // resolves to https://omenfi.com/icon-192.png per docs
    },
    authorizationResultCache: createDefaultAuthorizationResultCache(),
    cluster: 'mainnet-beta',
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  })

  console.log('MWA web adapter ready')
} catch (e) {
  console.log('MWA adapter not available:', e.message)
  window.mwaAdapter = null
}

import './app.js'
