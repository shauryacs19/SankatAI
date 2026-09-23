import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const sharedDir = path.resolve(__dirname, '../../packages/shared')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js references Node's `global`, which Vite
  // (unlike Webpack/CRA) doesn't polyfill in the browser.
  define: {
    global: 'globalThis',
  },
  // Framework-agnostic logic shared with the mobile app (packages/shared).
  resolve: {
    alias: { '@sankatai/shared': sharedDir },
  },
  // Split vendor code out of the single ~685 kB app chunk. Chunking only:
  // same modules, same execution order, no functional change.
  //
  // Vite 8 runs on Rolldown, not Rollup. Rolldown's `manualChunks` accepts a
  // FUNCTION only (the Rollup object form is rejected with "Expected Function
  // but received Object"), and both `manualChunks` and `advancedChunks` are
  // deprecated in rolldown 1.2.9 in favour of `output.codeSplitting`, which
  // takes the declarative group form used here.
  //
  // react / react-dom / react-router / scheduler are kept TOGETHER on purpose:
  // splitting React from the router breaks context identity across chunks.
  build: {
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
            },
            {
              name: 'motion',
              test: /[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/,
            },
            {
              name: 'cognito',
              test: /[\\/]node_modules[\\/]amazon-cognito-identity-js[\\/]/,
            },
            {
              name: 'icons',
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    host: true,
    // Allow importing the shared package which lives outside the Vite root.
    fs: { allow: ['..', sharedDir] },
    // In Docker dev, the backend is reachable at http://backend:5174 (compose
    // service name); locally it defaults to localhost. Override with
    // VITE_PROXY_TARGET.
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:5174',
    },
    // Bind-mounted files on Windows/Docker don't emit native FS events, so
    // hot reload silently misses changes. Enable polling in that case via
    // VITE_USE_POLLING=true (set in docker-compose-dev.yml).
    watch: process.env.VITE_USE_POLLING
      ? { usePolling: true, interval: 300 }
      : undefined,
  },
})
