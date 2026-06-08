import UPNG from 'upng-js'
import { renderPixelAlphabetPng } from './pixelAlphabet'

/* Canvas → 4-bit indexed PNG for G2 image containers.
 * White = lit (bright green on G2), black = transparent.
 *
 * Three render pipelines:
 *   - Score digits + colon (`1 : 1`): EvenTimeBigPixel via canvas + threshold. Digit
 *     glyphs are chunky enough that threshold restores the font's dot-matrix gaps.
 *   - Pixel alphabet (VS placeholder + team codes): cells stamped directly from the
 *     A–Z atlas SVG in `pixelAlphabet.ts`. Bypasses canvas font rendering entirely
 *     because letter glyph strokes were too thin for the threshold path.
 *   - Flags: render the SVG at moderate size, then inverted 16-shade greyscale.
 */

const PIXEL_FONT_LOADED = (async () => {
  if (typeof document === 'undefined') return
  const face = new FontFace('Even Time Big Pixel', `url(/fonts/EvenTimeBigPixel.ttf) format('truetype')`)
  await face.load()
  ;(document as any).fonts.add(face)
})()

let cachedCanvas: HTMLCanvasElement | null = null

function getCanvas(w: number, h: number): HTMLCanvasElement {
  if (!cachedCanvas) cachedCanvas = document.createElement('canvas')
  if (cachedCanvas.width !== w || cachedCanvas.height !== h) {
    cachedCanvas.width = w
    cachedCanvas.height = h
  }
  return cachedCanvas
}

function canvasTo16IndexedPng(canvas: HTMLCanvasElement, opts: { invert?: boolean } = {}): number[] {
  const invert = opts.invert ?? false
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext('2d')!
  const data = ctx.getImageData(0, 0, w, h).data
  const pc = w * h
  const buf = new Uint8Array(pc * 4)
  for (let i = 0; i < pc; i++) {
    const si = i * 4
    const lum = Math.round(0.299 * data[si] + 0.587 * data[si + 1] + 0.114 * data[si + 2])
    const adj = invert ? 255 - lum : lum
    const idx = Math.min(15, Math.round(adj / 17))
    const v = idx * 17
    buf[si] = v; buf[si + 1] = v; buf[si + 2] = v; buf[si + 3] = 255
  }
  const png = UPNG.encode([buf.buffer.slice(0, pc * 4) as ArrayBuffer], w, h, 16)
  return Array.from(new Uint8Array(png))
}

/* ── Pixel-grid text rendering for the score image ─────────────────────────
 * Render at the font's natural pixel grid (small), then scale up via
 * nearest-neighbor. This is the canonical way to render pixel fonts crisply
 * — never set ctx.font to a giant size, that re-anti-aliases.
 */

interface PixelTextOptions {
  text: string
  outW: number
  outH: number
  nativePx: number   /* native render size; should match the pixel font's design grid */
  scale: number      /* integer scale-up factor for nearest-neighbor enlarge */
}

// kept for potential reuse; currently unused
// @ts-expect-error unused export
async function renderPixelText({ text, outW, outH, nativePx, scale }: PixelTextOptions): Promise<number[]> {
  await PIXEL_FONT_LOADED
  /* tiny canvas slightly larger than nativePx for ascender/descender room */
  const tinyH = Math.max(nativePx, Math.ceil(outH / scale))
  const tinyW = Math.ceil(outW / scale)
  const tiny = document.createElement('canvas')
  tiny.width = tinyW
  tiny.height = tinyH
  const tctx = tiny.getContext('2d')!
  tctx.imageSmoothingEnabled = false
  tctx.fillStyle = '#000000'
  tctx.fillRect(0, 0, tinyW, tinyH)
  tctx.fillStyle = '#FFFFFF'
  tctx.textAlign = 'center'
  tctx.textBaseline = 'middle'
  tctx.font = `${nativePx}px "Even Time Big Pixel", monospace`
  tctx.fillText(text, tinyW / 2, tinyH / 2)

  /* scale up onto output canvas with nearest-neighbor */
  const out = getCanvas(outW, outH)
  const octx = out.getContext('2d')!
  octx.imageSmoothingEnabled = false
  octx.fillStyle = '#000000'
  octx.fillRect(0, 0, outW, outH)
  /* center the scaled tiny inside output */
  const drawW = tinyW * scale
  const drawH = tinyH * scale
  const dx = Math.round((outW - drawW) / 2)
  const dy = Math.round((outH - drawH) / 2)
  octx.drawImage(tiny, dx, dy, drawW, drawH)

  return canvasTo16IndexedPng(out)
}

/* ── Score: EvenTimeBigPixel digits + hand-drawn dash ─────────────────────
 * David's screenshot ground-truth: the dot-matrix scoreboard look IS this
 * font rendered at its native pixel-grid sizes (80px confirmed via PIL).
 * Earlier scale-up attempts failed because the small native render lost
 * pixel-grid integrity before being enlarged. Direct render at 80px on
 * the output canvas with smoothing OFF preserves the dots.
 *
 * The font has no hyphen glyph (covers digits + Latin letters + space + colon
 * only — confirmed via fontTools, spec §7.4). Dash is fillRect at digit weight. */

/* Shared pipeline for ALL EvenTimeBigPixel text image rendering.
 * - Render `text` centered on a w×h canvas at the largest on-grid font size
 *   from `sizes` that fits (with 8px padding).
 * - Threshold post-render to restore the font's dot-matrix gaps that browser
 *   canvas AA fills in. Lum ≥ threshold → 255 (lit), else → 0.
 * - Encode 4-bit indexed PNG. */
async function renderPixelTextPng(text: string, w: number, h: number, sizes: number[], threshold: number | null = 180): Promise<number[]> {
  await PIXEL_FONT_LOADED
  const canvas = getCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#FFFFFF'

  let chosenPx = sizes[sizes.length - 1]
  let textW = 0
  for (const px of sizes) {
    ctx.font = `${px}px "Even Time Big Pixel"`
    textW = Math.ceil(ctx.measureText(text).width)
    if (textW <= w - 8) { chosenPx = px; break }
  }
  ctx.font = `${chosenPx}px "Even Time Big Pixel"`
  /* Bottom-aligned: alphabetic baseline placed at y=h so the glyph bottom
   * sits flush with the canvas bottom. EvenTimeBigPixel has typoDescender=0
   * (§7.4), i.e. baseline = glyph bottom for digits + colon. Required for
   * Layer 2 where the score image's bottom edge = event log's top edge
   * (y=180), so the visible digits must extend all the way to the canvas
   * bottom; centering would leave ~30 px of empty space below them. */
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const x = Math.round((w - textW) / 2)
  ctx.fillText(text, x, h)

  if (threshold !== null) {
    const img = ctx.getImageData(0, 0, w, h)
    const px = img.data
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      const v = lum >= threshold ? 255 : 0
      px[i] = v; px[i + 1] = v; px[i + 2] = v
    }
    ctx.putImageData(img, 0, 0)
  }
  return canvasTo16IndexedPng(canvas)
}

export async function renderScorePng(text: string, w: number, h: number): Promise<number[]> {
  /* "1 : 1" — EvenTimeBigPixel digits + colon. Clean unitsPerEm=800 grid sizes:
   * 80px = 10 canvas px per design cell, 64px = 8, 50px = 6.25 (fractional —
   * keep but deprioritize), 40px = 5, 32px = 4. Bigger sizes look crisper
   * because each design cell maps to more whole pixels before AA — the band
   * is now 108 tall so the picker should land on 80 for the common "1 : 1"
   * case. Threshold=180 preserves dot-matrix gaps. */
  return renderPixelTextPng(text, w, h, [80, 64, 50, 40, 32])
}

/* VS for scheduled matches — pixel-alphabet path, pinned to dot=2/gap=1
 * so the letter height (21 rows * 3 stride - 1 = 62px) matches the
 * digit height when the score picker lands on fontPx=80 (cap height
 * ≈ 620/800 * 80 = 62px). Without the pin, the picker would chase the
 * largest stride that fits — at 288×120 that's stride=5 → letter height
 * 104, ~1.7× the digit height. David's words: "V & S should be the
 * same size as the digits". */
export async function renderVsPng(w: number, h: number): Promise<number[]> {
  return renderPixelAlphabetPng('VS', w, h, { dot: 2, gap: 1 })
}

/* Team code (ARG / FRA / TBD …) — pixel-alphabet path. `side` controls
 * horizontal alignment so HOME ('right') + AWAY ('left') letters lean
 * toward the central score band and end up true mirror-symmetric about
 * the canvas axis. Floor-centered single containers always end up 1-2
 * px off when the (container width − letter width) remainder is odd. */
export async function renderCodePng(code: string, w: number, h: number, side: 'home' | 'away'): Promise<number[]> {
  const align: 'left' | 'right' = side === 'home' ? 'right' : 'left'
  return renderPixelAlphabetPng(code, w, h, { align })
}

/* ── Flag rendering ───────────────────────────────────────────────────────
 * Binary-threshold pipeline. SVG → 2x-supersampled canvas → threshold to 1-bit.
 * For mono display, geometric pattern is what carries identity, not colour.
 */

const flagCache = new Map<string, number[]>()

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`flag load failed: ${url}`))
    img.src = url
  })
}

export async function renderFlagPng(svgUrl: string, w: number, h: number): Promise<number[]> {
  const key = `${svgUrl}:${w}x${h}`
  const cached = flagCache.get(key)
  if (cached) return cached
  const img = await loadImage(svgUrl)
  /* render at 2x then downsample for slightly smoother edges before threshold */
  const big = document.createElement('canvas')
  big.width = w * 2; big.height = h * 2
  const bctx = big.getContext('2d')!
  bctx.imageSmoothingEnabled = true
  bctx.fillStyle = '#000000'
  bctx.fillRect(0, 0, big.width, big.height)
  bctx.drawImage(img, 0, 0, big.width, big.height)

  /* downsample to target size with smoothing for anti-aliased input to threshold */
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ;(ctx as any).imageSmoothingQuality = 'high'
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(big, 0, 0, w, h)

  /* 16-shade inverted greyscale: dark stripes/shapes → bright green pixels,
   * white field → off. Preserves value contrast between adjacent flag colors
   * (e.g. France's blue/white/red, Argentina's pale-blue/white) which a
   * binary threshold flattened into solid blocks or empty fields. */
  const png = canvasTo16IndexedPng(c, { invert: true })
  flagCache.set(key, png)
  return png
}

export async function preloadFlags(codes: string[], w: number, h: number): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {}
  await Promise.all(codes.map(async (code) => {
    const url = `/flags/${code.toLowerCase()}.svg`
    try {
      out[code] = await renderFlagPng(url, w, h)
    } catch (e) {
      console.warn(`flag preload failed for ${code}:`, e)
    }
  }))
  return out
}

export function getCachedFlag(code: string, w: number, h: number): number[] | null {
  const url = `/flags/${code.toLowerCase()}.svg`
  return flagCache.get(`${url}:${w}x${h}`) ?? null
}
