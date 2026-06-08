#!/usr/bin/env python3
"""Render pixel-perfect G2 mockups for the spec doc.

Outputs three PNGs into docs/images/:
  - g2-layer-1.png        : today's schedule (header + two leveled lists)
  - g2-layer-2-live.png   : match detail, SF1 live, score 1 : 1
  - g2-layer-2-vs.png     : match detail, SF2 scheduled, VS placeholder

Why PIL and not a sim screenshot: PIL renders deterministic from the spec
geometry + bundled fonts/SVG, so the mockups stay in sync with the code
across reflows. Re-run after any Layer 2 geometry change.

Pipelines mirrored from the runtime:
  - Codes / VS  → public/fonts/even-pixel-alphabet.svg → cell-stamp
  - Score       → public/fonts/EvenTimeBigPixel.ttf → PIL textbbox (no AA
                   to threshold; PIL's truetype rasterizer is hard-edged
                   at integer sizes, no fuzz to clean)
  - Header / log → FK Grotesk Neue as a stand-in for LVGL default font
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FONTS = ROOT / "public" / "fonts"
OUT_DIR = ROOT / "docs" / "images"
OUT_DIR.mkdir(parents=True, exist_ok=True)

GREEN = (60, 250, 68)   # ER OS Green #3CFA44
BLACK = (0, 0, 0)
BG = BLACK
LIT = GREEN

# G2 canvas
W, H = 576, 288

# Layer 2 geometry (mirror src/g2/pageView.ts)
HEADER = (8, 8, 420, 56)
PEN = (436, 8, 132, 44)
SCORE = (144, 68, 288, 82)
CODE_H = (4, 98, 132, 52)
CODE_A = (440, 98, 132, 52)
LOG = (8, 180, 560, 100)

# Layer 1 geometry
L1_HEAD = (8, 8, 560, 28)
L1_LIST_Y = 48
L1_LIST_H = 232
L1_LEFT = (8, L1_LIST_Y, 280, L1_LIST_H)
L1_RIGHT = (296, L1_LIST_Y, 272, L1_LIST_H)


# -- Pixel alphabet (mirrors src/g2/pixelAlphabet.ts) -----------------------

ALPHABET_PATH = PUBLIC_FONTS / "even-pixel-alphabet.svg"


def load_glyphs() -> dict[str, dict]:
    """Parse the A-Z atlas SVG into per-letter cell grids."""
    tree = ET.parse(ALPHABET_PATH)
    root = tree.getroot()
    for el in root.iter():
        el.tag = el.tag.split("}", 1)[-1]
    glyphs: dict[str, dict] = {}
    for g in root.findall("g"):
        gid = g.get("id")
        if not gid:
            continue
        rects = g.findall("rect")
        if not rects:
            continue
        xs = [int(r.get("x", "0")) for r in rects]
        ys = [int(r.get("y", "0")) for r in rects]
        min_x, min_y = min(xs), min(ys)
        max_x, max_y = max(xs), max(ys)
        cells = [
            ((int(r.get("x", "0")) - min_x) // 30, (int(r.get("y", "0")) - min_y) // 30)
            for r in rects
        ]
        cols = (max_x - min_x) // 30 + 1
        rows = (max_y - min_y) // 30 + 1
        glyphs[gid.upper()] = {"cols": cols, "rows": rows, "cells": cells}
    return glyphs


GLYPHS = load_glyphs()


def draw_pixel_text(
    img: Image.Image,
    text: str,
    box: tuple[int, int, int, int],
    *,
    dot: int | None = None,
    gap: int | None = None,
    letter_spacing_cells: int = 2,
    pad: int = 4,
    valign: str = "bottom",
    halign: str = "center",
) -> None:
    """Stamp pixel-alphabet glyphs onto img inside box (x, y, w, h).

    Matches renderPixelAlphabetPng — when dot/gap are None, picks the largest
    stride fitting box dims (candidates: (4,1), (3,1), (2,1), (1,1), (1,0))."""
    x0, y0, w, h = box
    tokens = []
    for ch in text.upper():
        if ch == " ":
            tokens.append("space")
        elif ch in GLYPHS:
            tokens.append(GLYPHS[ch])
    real = [t for t in tokens if t != "space"]
    if not real:
        return

    def measure(total_cols: int, max_rows: int, stride: int, gap_: int):
        return total_cols * stride - gap_, max_rows * stride - gap_

    candidates = [(4, 1), (3, 1), (2, 1), (1, 1), (1, 0)]
    total_cols = 0
    for i, t in enumerate(tokens):
        if t == "space":
            total_cols += 4
        else:
            total_cols += t["cols"]
        if i < len(tokens) - 1:
            total_cols += letter_spacing_cells
    max_rows = max(t["rows"] for t in real)

    if dot is None or gap is None:
        chosen = (1, 0)
        for d, g in candidates:
            rw, rh = measure(total_cols, max_rows, d + g, g)
            if rw <= w - pad * 2 and rh <= h - pad * 2:
                chosen = (d, g)
                break
        dot, gap = chosen
    stride = dot + gap

    render_w, render_h = measure(total_cols, max_rows, stride, gap)
    if halign == "left":
        off_x = pad
    elif halign == "right":
        off_x = max(pad, w - render_w - pad)
    else:
        off_x = max(pad, (w - render_w) // 2)
    if valign == "bottom":
        off_y = max(0, h - render_h)
    elif valign == "top":
        off_y = pad
    else:
        off_y = max(pad, (h - render_h) // 2)

    draw = ImageDraw.Draw(img)
    cursor = 0
    for i, t in enumerate(tokens):
        if t == "space":
            cursor += 4
        else:
            for c, r in t["cells"]:
                px = x0 + off_x + (cursor + c) * stride
                py = y0 + off_y + r * stride
                draw.rectangle((px, py, px + dot - 1, py + dot - 1), fill=LIT)
            cursor += t["cols"]
        if i < len(tokens) - 1:
            cursor += letter_spacing_cells


# -- EvenTimeBigPixel score (PIL truetype, integer sizes are hard-edged) ----

EBP = PUBLIC_FONTS / "EvenTimeBigPixel.ttf"


def draw_score_pixel(img: Image.Image, text: str, box: tuple[int, int, int, int]):
    """Render the score via PIL truetype at the largest on-grid size that
    fits, bottom-aligned in box. PIL rasterizer is hard-edged at integer
    pixel sizes — no AA fuzz to threshold."""
    x0, y0, w, h = box
    sizes = [80, 64, 50, 40, 32]
    chosen = sizes[-1]
    chosen_font = None
    text_w = 0
    text_h = 0
    for s in sizes:
        f = ImageFont.truetype(str(EBP), s)
        bbox = f.getbbox(text)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        if tw <= w - 8 and th <= h:
            chosen = s
            chosen_font = f
            text_w = tw
            text_h = th
            break
    if chosen_font is None:
        chosen_font = ImageFont.truetype(str(EBP), chosen)
        bbox = chosen_font.getbbox(text)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
    bbox = chosen_font.getbbox(text)
    draw = ImageDraw.Draw(img)
    # bottom-align baseline at y0 + h, then shift up by descender (0 for EBP)
    bx = x0 + (w - text_w) // 2 - bbox[0]
    by = y0 + h - text_h - bbox[1]
    draw.text((bx, by), text, fill=LIT, font=chosen_font)


# -- Plain text (header + event log) ----------------------------------------

FK = PUBLIC_FONTS / "FKGroteskNeue.ttf"


def draw_text_lines(
    img: Image.Image,
    lines: list[str],
    box: tuple[int, int, int, int],
    *,
    size: int = 16,
    line_h: int = 22,
    pad: int = 8,
):
    x0, y0, w, h = box
    font = ImageFont.truetype(str(FK), size)
    draw = ImageDraw.Draw(img)
    for i, line in enumerate(lines):
        y = y0 + pad + i * line_h
        draw.text((x0 + pad, y), line, fill=LIT, font=font)


def draw_border(img: Image.Image, box: tuple[int, int, int, int], radius: int = 4):
    x0, y0, w, h = box
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((x0, y0, x0 + w - 1, y0 + h - 1), radius=radius, outline=LIT, width=1)


# -- Mockups ----------------------------------------------------------------

def render_layer2(state: str, out_name: str):
    """state: 'live' (post-Alvarez 2-1 at 67'), 'scheduled' (VS), or 'ft' (final whistle)."""
    img = Image.new("RGB", (W, H), BG)

    # Header (2 rows) — penalty now lives in the top-right PEN container,
    # statusVerbose returns clean "FULL TIME" again.
    if state == "live":
        header = ["SEMIFINAL", "SECOND HALF  67 MIN"]
    elif state == "ft":
        header = ["SEMIFINAL", "FULL TIME"]
    else:
        header = ["SEMIFINAL", "KICKOFF IN 2H"]
    draw_text_lines(img, header, HEADER, size=18, line_h=24, pad=4)

    # Top-right PEN indicator — only present for FT-with-shootout matches.
    if state == "ft":
        draw_text_lines(img, ["PEN", "4-2"], PEN, size=18, line_h=22, pad=2)

    # Score band — regulation/ET score; penalty only in the header row.
    if state == "live":
        draw_score_pixel(img, "2 : 1", SCORE)
    elif state == "ft":
        # 2022 Lusail Final scoreline mirrored by debugFinalWhistle()
        draw_score_pixel(img, "3 : 3", SCORE)
    else:
        draw_pixel_text(img, "VS", SCORE, dot=2, gap=1, letter_spacing_cells=2, valign="bottom")

    # Codes — HOME align-right, AWAY align-left → mirror-symmetric about canvas axis.
    home, away = ("ARG", "FRA") if state in ("live", "ft") else ("BRA", "POR")
    draw_pixel_text(img, home, CODE_H, valign="bottom", halign="right")
    draw_pixel_text(img, away, CODE_A, valign="bottom", halign="left")

    # Event log border + 3 rows
    draw_border(img, LOG)
    if state == "live":
        log_lines = [
            "67'  GOAL  Alvarez (ARG)",
            "58'  YEL   Camavinga (FRA)",
            "41'  GOAL  Mbappe (FRA)",
        ]
    elif state == "ft":
        # Show last 3 entries from the FT-scenario timeline (debugFinalWhistle).
        log_lines = [
            "120' FT    PEN 4-2 ARG WIN",
            "95'  GOAL  Coman (FRA)",
            "88'  GOAL  Di Maria (ARG)",
        ]
    else:
        log_lines = ["Kicks off in 2h", "", ""]
    draw_text_lines(img, log_lines, LOG, size=14, line_h=22, pad=8)

    out = OUT_DIR / out_name
    img.save(out, "PNG")
    print(f"wrote {out.relative_to(ROOT)}")


def render_layer1():
    img = Image.new("RGB", (W, H), BG)
    # Header
    draw_text_lines(img, ["SEMIFINALS    2 today, 1 live"], L1_HEAD, size=16, line_h=20, pad=4)
    # Left list (matchup)
    left = ["ARG vs FRA", "BRA vs POR", "NED vs GER (Tom)"]
    draw_text_lines(img, left, L1_LEFT, size=18, line_h=36, pad=8)
    # Right list (status / score)
    right = ["LIVE 42  1-1", "in 2h", "Tomorrow"]
    draw_text_lines(img, right, L1_RIGHT, size=18, line_h=36, pad=8)
    # Selection border on first item (mirror isItemSelectBorderEn=1)
    sel_y = L1_LIST_Y + 4
    draw_border(img, (L1_LEFT[0], sel_y, L1_LEFT[2] - 4, 36), radius=4)

    out = OUT_DIR / "g2-layer-1.png"
    img.save(out, "PNG")
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    render_layer1()
    render_layer2("scheduled", "g2-layer-2-vs.png")
    render_layer2("live", "g2-layer-2-live.png")
    render_layer2("ft", "g2-layer-2-ft.png")
