import { defineConfig } from 'vitest/config'

/* Two test environments coexist:
 *  - server/store/format tests run in Node (no DOM)
 *  - client SSE consumer tests need a DOM-ish global so we can install
 *    a mock EventSource on window/globalThis. happy-dom is the cheapest
 *    way to get that without dragging jsdom in.
 *
 * environmentMatchGlobs is per-file: client tests opt in by living under
 * test/client-*.test.ts, everything else stays in node. */
export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['test/client-*.test.ts', 'happy-dom'],
    ],
    include: ['test/**/*.test.ts'],
    testTimeout: 5000,
    hookTimeout: 5000,
    /* Sequential by default — server tests spin up a real HTTP listener
     * on a random port, but running files in parallel still risks
     * fake-timer cross-contamination and noisy console output. */
    pool: 'threads',
    fileParallelism: false,
  },
})
