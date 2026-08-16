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
