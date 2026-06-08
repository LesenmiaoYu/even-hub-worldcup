import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { MatchStore } from './state.ts'
import { LIVE_TICK } from './seed.ts'
import { writeSseEvent, writeSseHeaders, writeSseComment } from './sse.ts'

const DEFAULT_HEARTBEAT_MS = 15000

/* Permissive CORS — the demo runs against vite at :5173 and the EvenHub
 * simulator on whatever port it picks. Locking this down is a Phase 3
 * concern. */
function applyCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  applyCors(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function notFound(res: ServerResponse): void {
  sendJson(res, 404, { ok: false, error: 'not_found' })
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  return JSON.parse(raw)
}

export interface AppOptions {
  store: MatchStore
  heartbeatMs?: number
}

export interface AppHandle {
  server: Server
  heartbeats: Set<ReturnType<typeof setInterval>>
}

/* Build (but do not listen on) an HTTP server bound to the given store.
 * Returns a handle that owns the running heartbeat timers so callers
 * (especially tests) can tear them down without leaking. */
export function createApp(opts: AppOptions): AppHandle {
  const { store, heartbeatMs = DEFAULT_HEARTBEAT_MS } = opts
  const heartbeats = new Set<ReturnType<typeof setInterval>>()

  function handleEvents(req: IncomingMessage, res: ServerResponse): void {
    writeSseHeaders(res)
    writeSseEvent(res, 'snapshot', { matches: store.getAll() })

    const unsub = store.subscribe(delta => {
      writeSseEvent(res, 'delta', delta)
    })

    const heartbeat = setInterval(() => {
      writeSseComment(res, 'ping')
    }, heartbeatMs)
    heartbeats.add(heartbeat)

    const cleanup = () => {
      clearInterval(heartbeat)
      heartbeats.delete(heartbeat)
      unsub()
    }
    req.on('close', cleanup)
    req.on('error', cleanup)
  }

  type CommandBody = { command?: string }

  async function handleCommand(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: CommandBody
    try {
      body = (await readJson(req)) as CommandBody
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const command = body.command
    const target = LIVE_TICK.matchId

    switch (command) {
      case 'ping': {
        sendJson(res, 200, { ok: true, pong: true })
        return
      }
      case 'start_live': {
        const ok = store.startLive(target)
        if (!ok) {
          sendJson(res, 404, { ok: false, error: `match_not_found:${target}` })
          return
        }
        sendJson(res, 200, { ok: true })
        return
      }
      case 'mbappe_goal': {
        const m = store.get(target)
        if (!m || m.state !== 'live' || m.minute === null) {
          sendJson(res, 409, { ok: false, error: 'match_not_live' })
          return
        }
        store.applyEvent(
          target,
          { minute: m.minute, type: 'goal', side: 'away', player: 'Mbappé' },
          { away: 1 },
        )
        sendJson(res, 200, { ok: true })
        return
      }
      case 'sub': {
        const m = store.get(target)
        if (!m || m.state !== 'live' || m.minute === null) {
          sendJson(res, 409, { ok: false, error: 'match_not_live' })
          return
        }
        store.applyEvent(target, {
          minute: m.minute,
          type: 'sub',
          side: 'away',
          player: 'Mbappé',
          playerIn: 'Coman',
        })
        sendJson(res, 200, { ok: true })
        return
      }
      default: {
        sendJson(res, 400, { ok: false, error: `unknown_command:${command ?? ''}` })
      }
    }
  }

  const server = createServer(async (req, res) => {
    if (!req.url || !req.method) {
      notFound(res)
      return
    }

    if (req.method === 'OPTIONS') {
      applyCors(res)
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    const path = url.pathname

    if (req.method === 'GET' && path === '/health') {
      sendJson(res, 200, { ok: true, uptimeSec: Math.round(process.uptime()) })
      return
    }
    if (req.method === 'GET' && path === '/events') {
      handleEvents(req, res)
      return
    }
    if (req.method === 'POST' && path === '/command') {
      try {
        await handleCommand(req, res)
      } catch (err) {
        console.error('[command] handler threw:', err)
        sendJson(res, 500, { ok: false, error: 'internal_error' })
      }
      return
    }

    notFound(res)
  })

  return { server, heartbeats }
}

/** Close every heartbeat interval the app owns, then close the HTTP
 * server. Tests call this for clean teardown — production callers can
 * use it on SIGTERM. */
export function closeApp(handle: AppHandle): Promise<void> {
  for (const h of handle.heartbeats) clearInterval(h)
  handle.heartbeats.clear()
  return new Promise(resolve => {
    handle.server.close(() => resolve())
  })
}
