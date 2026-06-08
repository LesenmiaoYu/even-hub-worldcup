#!/bin/bash
# Copy 58 WC 2026 team flag SVGs from flag-icons into public/flags/{FIFA}.svg.
# Pairs: FIFA-3 ISO-2 (separated by colon)
PAIRS=(
  # CONCACAF hosts + 3 more
  usa:us  can:ca  mex:mx  crc:cr  pan:pa  jam:jm
  # CONMEBOL (6)
  arg:ar  bra:br  uru:uy  col:co  ecu:ec  par:py
  # UEFA (16 + 4 from iSports projection: BIH, SCO, SWE, TUR)
  esp:es  fra:fr  eng:gb-eng  ger:de  ita:it  ned:nl  por:pt  bel:be
  cro:hr  swi:ch  den:dk  pol:pl  aut:at  cze:cz  srb:rs  nor:no
  bih:ba  sco:gb-sct  swe:se  tur:tr
  # CAF (9 + 3 from iSports projection: CPV, COD, RSA)
  mar:ma  sen:sn  egy:eg  gha:gh  cmr:cm  nga:ng  alg:dz  tun:tn  civ:ci
  cpv:cv  cod:cd  rsa:za
  # AFC (8 + 2 from iSports projection: JOR, UZB)
  jpn:jp  kor:kr  aus:au  irn:ir  ksa:sa  qat:qa  uae:ae  irq:iq
  jor:jo  uzb:uz
  # OFC + playoffs (3 + 1 from iSports projection: CUW)
  nzl:nz  bol:bo  hai:ht
  cuw:cw
)
SRC=node_modules/flag-icons/flags/4x3
DST=public/flags
mkdir -p "$DST"
ok=0; miss=0
for pair in "${PAIRS[@]}"; do
  fifa="${pair%:*}"
  iso="${pair#*:}"
  if [[ -f "$SRC/$iso.svg" ]]; then
    cp "$SRC/$iso.svg" "$DST/$fifa.svg"
    ok=$((ok+1))
  else
    echo "MISSING: $fifa ← $iso.svg"
    miss=$((miss+1))
  fi
done
echo "---"
echo "copied: $ok  missing: $miss  total target: ${#PAIRS[@]}"
echo "now in public/flags: $(ls $DST | wc -l)"
