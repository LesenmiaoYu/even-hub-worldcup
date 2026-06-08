import type { ServerResponse } from 'node:http'

/* Minimal SSE framing helper. We deliberately don't `id:` events for now —
 * Phase 0+1 clients reconcile via the full match snapshot embedded in each
 * delta, so resume-from-last-id isn't needed yet. */

export function writeSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  })
  /* Retry hint: if the connection drops, browsers wait this many ms before
   * reconnecting. 2s feels right for a LAN demo. */
  res.write('retry: 2000\n\n')
}

export function writeSseEvent(res: ServerResponse, event: string, data: unknown): void {
  /* SSE is line-oriented; JSON.stringify never produces newlines so a
   * single `data:` line is safe. */
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

export function writeSseComment(res: ServerResponse, text: string): void {
  /* Lines starting with `:` are comments — useful as a heartbeat so
   * intermediate proxies don't time the connection out. */
  res.write(`: ${text}\n\n`)
}
