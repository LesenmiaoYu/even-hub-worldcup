import { store } from './state.ts'
import { createApp, closeApp } from './app.ts'
import { hydrateFromIsports, startIsportsPollers } from './isports/poller.ts'

const PORT = Number(process.env.PORT ?? 3001)

async function main(): Promise<void> {
  console.log('[wc-server] hydrating from iSports /schedule before listen…')
  try {
    await hydrateFromIsports(store)
  } catch (err) {
    /* Boot must not fail just because iSports is unreachable or
     * rate-limited. Start with an empty store; the pollers below will
     * keep retrying and fill the store the moment iSports recovers.
     * Clients connected during the gap just see an empty snapshot and
     * pick up later deltas. */
    console.error('[wc-server] iSports hydrate failed — starting empty, pollers will retry:', err)
  }
  const pollers = startIsportsPollers(store)

  /* Stale-state sweep. iSports drops finished matches from
   * /livescores/changes before flipping state to 'live'/'ft', so the
   * server holds matches as 'scheduled' past their kickoff. Every 30s
   * we promote past-kickoff (>5min) scheduled matches to 'live'. Every
   * connected client gets the corrected state via SSE reset delta —
   * regardless of bundle version. */
  const sweepTimer = setInterval(() => {
    const n = store.sweepStaleStates()
    if (n > 0) console.log(`[wc-server] sweep promoted ${n} stale scheduled→live`)
  }, 30_000)
  /* Run once immediately so the boot snapshot is already correct for
   * the first SSE subscriber. */
  store.sweepStaleStates()

  const handle = createApp({ store })

  handle.server.listen(PORT, () => {
    console.log(`[wc-server] listening on http://localhost:${PORT}`)
    console.log(`[wc-server] GET /events  (SSE)`)
    console.log(`[wc-server] GET /health`)
  })

  const shutdown = (signal: string) => {
    console.log(`[wc-server] ${signal} received — shutting down`)
    clearInterval(sweepTimer)
    pollers.stop()
    void closeApp(handle).then(() => process.exit(0))
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch(err => {
  console.error('[wc-server] boot failed:', err)
  process.exit(1)
})
