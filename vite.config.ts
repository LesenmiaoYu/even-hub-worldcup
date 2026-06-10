import { defineConfig } from 'vite'

/* Dev-only proxy: forward the SSE stream to the Node server on :3001.
 * Vite proxies SSE natively — the connection stays open and chunks pass
 * through without buffering.
 *
 * Prod (.ehpk): the client uses VITE_SERVER_URL (absolute) so this proxy
 * doesn't apply. See src/state/serverClient.ts. */
export default defineConfig({
  server: {
    proxy: {
      '/events': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
