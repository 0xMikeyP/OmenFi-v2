import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'process'],
      globals: { Buffer: true, process: true },
    }),
  ],
  publicDir: 'public',
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
