import { defineConfig } from 'vite'

/* Dev-only proxy: forward /events (SSE) and /command (POST) to the
 * Node server on :3001. Vite proxies SSE natively — the connection
 * stays open and chunks pass through without buffering. In production
 * the host is expected to expose both paths on the same origin. */
export default defineConfig({
  server: {
    proxy: {
      '/events': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/command': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
