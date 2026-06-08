import { store } from './state.ts'
import { createApp, closeApp } from './app.ts'
import { hydrateFromIsports, startIsportsPollers, type PollerHandle } from './isports/poller.ts'

const PORT = Number(process.env.PORT ?? 3001)

/* ENABLE_ISPORTS toggles between the mock seed (default) and live
 * iSports hydration + pollers. Accepted truthy values: 'true' / '1' /
 * 'yes' (case-insensitive). Anything else — including unset — leaves
 * the server on the existing mock path so dev/CI keeps working. */
function isIsportsEnabled(): boolean {
  const v = (process.env.ENABLE_ISPORTS ?? '').toLowerCase().trim()
  return v === 'true' || v === '1' || v === 'yes'
}

async function main(): Promise<void> {
  let pollers: PollerHandle | null = null

  if (isIsportsEnabled()) {
    console.log('[wc-server] iSports mode enabled — hydrating from /schedule before listen…')
    await hydrateFromIsports(store)
    pollers = startIsportsPollers(store)
  } else {
    console.log('[wc-server] mock mode — using server/seed.ts')
  }

  const handle = createApp({ store })

  handle.server.listen(PORT, () => {
    console.log(`[wc-server] listening on http://localhost:${PORT}`)
    console.log(`[wc-server] GET  /events    (SSE)`)
    console.log(`[wc-server] POST /command   start_live | mbappe_goal | sub | ping`)
    console.log(`[wc-server] GET  /health`)
  })

  const shutdown = (signal: string) => {
    console.log(`[wc-server] ${signal} received — shutting down`)
    if (pollers) pollers.stop()
    void closeApp(handle).then(() => process.exit(0))
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch(err => {
  console.error('[wc-server] boot failed:', err)
  process.exit(1)
})
