import UPNG from 'upng-js'

/* Pixel-alphabet rendering for G2 Layer 2 (VS + team codes).
 *
 * Why this exists: rendering EvenTimeBigPixel LETTERS through the browser
 * canvas (textRasterizer → threshold → 4-bit PNG) consistently came back
 * blank or invisible — letter glyph strokes are too thin for canvas AA to
 * deposit enough luminance. Digits work; letters don't.
 *
 * Workaround: David provided `public/fonts/even-pixel-alphabet.svg`, an
 * A–Z atlas where each letter is laid out as a pixel grid of 20×20 cells
 * on a 30px stride. We parse each glyph into a sparse cell grid once at
 * boot, then stamp filled rects directly to canvas — no font rendering
 * step at all, so AA can't eat the strokes.
 */

interface Glyph {
  cols: number
  rows: number
  cells: Array<[number, number]>  /* [col, row] for each lit dot */
}

let glyphCache: Map<string, Glyph> | null = null
let glyphLoading: Promise<void> | null = null

/* Cell stride in the source SVG: rects are 20×20 spaced on 30px grid. */
const SVG_STRIDE = 30
const SVG_ORIGIN = 40

async function loadGlyphs(): Promise<void> {
  if (glyphCache) return
  if (glyphLoading) return glyphLoading
  glyphLoading = (async () => {
    const res = await fetch('/fonts/even-pixel-alphabet.svg')
    const txt = await res.text()
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml')
    const groups = doc.querySelectorAll('g[id]')
    const out = new Map<string, Glyph>()
    groups.forEach(g => {
      const id = g.getAttribute('id')
      if (!id) return
      const rects = g.querySelectorAll('rect')
      if (rects.length === 0) return
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      const xs: number[] = []
      const ys: number[] = []
      rects.forEach(r => {
        const x = parseInt(r.getAttribute('x') ?? '0', 10)
        const y = parseInt(r.getAttribute('y') ?? '0', 10)
        xs.push(x); ys.push(y)
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      })
      /* Normalize cell coords against this glyph's own bounding box so col 0,
       * row 0 = top-left lit cell of this letter (not the SVG canvas origin). */
      const cells: Array<[number, number]> = xs.map((x, i) => [
        (x - minX) / SVG_STRIDE,
        (ys[i] - minY) / SVG_STRIDE,
      ])
      const cols = (maxX - minX) / SVG_STRIDE + 1
      const rows = (maxY - minY) / SVG_STRIDE + 1
      out.set(id.toUpperCase(), { cols, rows, cells })
    })
    glyphCache = out
  })()
  return glyphLoading
}

void SVG_ORIGIN  /* kept for documentation; not used at runtime */

function getGlyph(ch: string): Glyph | null {
  if (!glyphCache) return null
  return glyphCache.get(ch.toUpperCase()) ?? null
}

function canvasTo16IndexedPng(canvas: HTMLCanvasElement): number[] {
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext('2d')!
  const data = ctx.getImageData(0, 0, w, h).data
  const pc = w * h
  const buf = new Uint8Array(pc * 4)
  for (let i = 0; i < pc; i++) {
    const si = i * 4
    const lum = Math.round(0.299 * data[si] + 0.587 * data[si + 1] + 0.114 * data[si + 2])
    const idx = Math.min(15, Math.round(lum / 17))
    const v = idx * 17
    buf[si] = v; buf[si + 1] = v; buf[si + 2] = v; buf[si + 3] = 255
  }
  const png = UPNG.encode([buf.buffer.slice(0, pc * 4) as ArrayBuffer], w, h, 16)
  return Array.from(new Uint8Array(png))
}

interface RenderOpts {
  /* On-grid spacing in canvas pixels. dot = lit-cell size, gap = between-cell
   * gap (preserves the dot-matrix look). letterSpacing in source cells, so it
   * scales with stride. */
  dot?: number
  gap?: number
  letterSpacing?: number
  /* Horizontal placement inside the canvas. 'center' = floor-biased center
   * (default; off by 1 px when the remainder is odd). 'left' / 'right' put
   * the rendered glyph block flush to that edge minus `pad`. For HOME / AWAY
   * code pairs, use 'right' on HOME + 'left' on AWAY so the letters lean
   * toward the score and end up TRUE mirror-symmetric about the canvas axis. */
  align?: 'left' | 'center' | 'right'
}

/* Auto-pick the largest stride (dot+gap) where the rendered string fits
 * w×h with `pad`px breathing room on every side. */
function pickScale(glyphs: Glyph[], letterSpacingCells: number, w: number, h: number, pad: number): {dot: number, gap: number} {
  let totalCols = 0
  glyphs.forEach((g, i) => {
    totalCols += g.cols
    if (i < glyphs.length - 1) totalCols += letterSpacingCells
  })
  const maxRows = Math.max(...glyphs.map(g => g.rows), 0)
  /* Try dot=3 down to dot=1; gap is always 1 less than dot (keeps the dots
   * visibly distinct without dominating). dot=3 gap=1 → stride 4 (chunky);
   * dot=2 gap=1 → stride 3 (matches SVG ratio); dot=1 gap=1 → stride 2. */
  const candidates: Array<[number, number]> = [
    [4, 1], [3, 1], [2, 1], [1, 1], [1, 0],
  ]
  for (const [dot, gap] of candidates) {
    const stride = dot + gap
    const renderW = totalCols * stride - gap
    const renderH = maxRows * stride - gap
    if (renderW <= w - pad * 2 && renderH <= h - pad * 2) return { dot, gap }
  }
  return { dot: 1, gap: 0 }
}

export async function renderPixelAlphabetPng(text: string, w: number, h: number, opts: RenderOpts = {}): Promise<number[]> {
  await loadGlyphs()
  const letterSpacingCells = opts.letterSpacing ?? 2
  const pad = 4

  /* Resolve text → glyphs (skip unsupported chars, render space as gap). */
  const tokens: Array<Glyph | 'space'> = []
  for (const raw of text) {
    const ch = raw.toUpperCase()
    if (ch === ' ') { tokens.push('space'); continue }
    const g = getGlyph(ch)
    if (g) tokens.push(g)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)

  if (tokens.length === 0) return canvasTo16IndexedPng(canvas)

  const realGlyphs = tokens.filter((t): t is Glyph => t !== 'space')
  let { dot, gap } = opts.dot != null && opts.gap != null
    ? { dot: opts.dot, gap: opts.gap }
    : pickScale(realGlyphs, letterSpacingCells, w, h, pad)
  const stride = dot + gap

  /* Compute layout: column cursor advances per glyph + per letter-space. */
  let totalCols = 0
  tokens.forEach((t, i) => {
    if (t === 'space') totalCols += 4  /* word-space = 4 cells wide */
    else totalCols += t.cols
    if (i < tokens.length - 1) totalCols += letterSpacingCells
  })
  const maxRows = Math.max(...realGlyphs.map(g => g.rows), 0)
  const renderW = totalCols * stride - gap
  const renderH = maxRows * stride - gap
  const align = opts.align ?? 'center'
  let offX: number
  if (align === 'left') offX = pad
  else if (align === 'right') offX = Math.max(pad, w - renderW - pad)
  else offX = Math.max(pad, Math.floor((w - renderW) / 2))
  /* Bottom-aligned vertically so the visible letter bottom = canvas bottom.
   * Layer 2 uses code + VS images that "sit on" the event log — the image
   * containers' bottom edges are already at y=180 (= log top), but if the
   * glyph were centered inside the canvas there'd be ~29 px of dead space
   * below it on screen, breaking the visual "sit on" anchor. */
  const offY = Math.max(0, h - renderH)

  ctx.fillStyle = '#FFFFFF'
  let cursorCol = 0
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === 'space') {
      cursorCol += 4
    } else {
      for (const [c, r] of t.cells) {
        ctx.fillRect(offX + (cursorCol + c) * stride, offY + r * stride, dot, dot)
      }
      cursorCol += t.cols
    }
    if (i < tokens.length - 1) cursorCol += letterSpacingCells
  }

  return canvasTo16IndexedPng(canvas)
}

/* Pre-warm the glyph cache so the first detail render isn't blocked on
 * the SVG fetch. Safe to call before the bridge is ready. */
export function preloadAlphabet(): Promise<void> {
  return loadGlyphs()
}
