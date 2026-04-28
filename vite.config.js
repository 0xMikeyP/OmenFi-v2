import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    nodePolyfills({
      // Needed for @solana/web3.js — it uses Buffer, process, etc.
      include: ['buffer', 'process'],
      globals: { Buffer: true, process: true },
    }),
  ],
  build: {
    outDir: 'dist',
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    include: [
      '@solana/web3.js',
      '@solana-mobile/mobile-wallet-adapter-protocol',
      '@solana-mobile/mobile-wallet-adapter-protocol-web3js',
      '@solana-mobile/wallet-adapter-mobile',
    ],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
})
