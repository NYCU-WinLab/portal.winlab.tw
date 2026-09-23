// Builds lib/door/font/unifont-subset.bin, the door display font,
// from an upstream GNU Unifont .hex file.
//
// From apps/portal:
//   bun scripts/build-unifont-subset.ts                 # download the pinned release
//   bun scripts/build-unifont-subset.ts unifont.hex.gz  # use a local .hex or .hex.gz
//
// The layout is documented in lib/door/font.ts, which owns the
// offsets; this script only fills them in. Bump UNIFONT_VERSION and
// UNIFONT_SHA256 together.

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { gunzipSync } from "node:zlib"

import {
  ASCII_FIRST,
  ASCII_LAST,
  ASCII_OFFSET,
  CJK_FIRST,
  CJK_LAST,
  CJK_OFFSET,
  FONT_BYTES,
  FONT_PATH,
  GLYPH_HEIGHT,
  NARROW_FALLBACK_OFFSET,
  WIDE_FALLBACK_OFFSET,
} from "@/lib/door/font"

const UNIFONT_VERSION = "18.0.01"
const UNIFONT_URL = `https://unifoundry.com/pub/unifont/unifont-${UNIFONT_VERSION}/font-builds/unifont-${UNIFONT_VERSION}.hex.gz`
const UNIFONT_SHA256 =
  "e66385c79a0b8b24a466f3129930e08a966a935b4bf3b28c6bb17a9df9bf791d"

// U+FFFD REPLACEMENT CHARACTER for unknown narrow and wide characters when
// Unifont has it at that width; otherwise a hollow box.
const REPLACEMENT = 0xfffd

async function loadHex(source: string | undefined): Promise<string> {
  let raw: Uint8Array
  if (source) {
    raw = new Uint8Array(readFileSync(source))
  } else {
    const res = await fetch(UNIFONT_URL)
    if (!res.ok) throw new Error(`${UNIFONT_URL} responded ${res.status}`)
    raw = new Uint8Array(await res.arrayBuffer())
    const digest = createHash("sha256").update(raw).digest("hex")
    if (digest !== UNIFONT_SHA256) {
      throw new Error(`sha256 mismatch: got ${digest}`)
    }
  }
  const gzipped = raw[0] === 0x1f && raw[1] === 0x8b
  return new TextDecoder().decode(gzipped ? gunzipSync(raw) : raw)
}

// A .hex line is "XXXX:<32 or 64 hex digits>": 16 rows of 8 or 16 pixels.
function parseHex(text: string): Map<number, Uint8Array> {
  const glyphs = new Map<number, Uint8Array>()
  for (const line of text.split("\n")) {
    const match = /^([0-9A-F]{4,6}):([0-9A-F]+)$/i.exec(line.trim())
    if (!match) continue
    const [, cp, bits] = match
    if (!cp || !bits || (bits.length !== 32 && bits.length !== 64)) continue
    glyphs.set(parseInt(cp, 16), Uint8Array.from(Buffer.from(bits, "hex")))
  }
  return glyphs
}

function hollowBox(bytesPerRow: number): Uint8Array {
  const out = new Uint8Array(GLYPH_HEIGHT * bytesPerRow)
  const width = bytesPerRow * 8
  const set = (x: number, y: number) => {
    const i = y * bytesPerRow + (x >> 3)
    out[i] = (out[i] ?? 0) | (0x80 >> (x & 7))
  }
  for (let x = 1; x < width - 1; x++) {
    set(x, 2)
    set(x, GLYPH_HEIGHT - 3)
  }
  for (let y = 2; y < GLYPH_HEIGHT - 2; y++) {
    set(1, y)
    set(width - 2, y)
  }
  return out
}

async function main() {
  const glyphs = parseHex(await loadHex(process.argv[2]))
  const out = new Uint8Array(FONT_BYTES)
  const narrowBytes = GLYPH_HEIGHT
  const wideBytes = GLYPH_HEIGHT * 2

  const pick = (cp: number, bytes: number) => {
    const glyph = glyphs.get(cp)
    return glyph && glyph.length === bytes ? glyph : undefined
  }

  const narrowFallback = pick(REPLACEMENT, narrowBytes) ?? hollowBox(1)
  const wideFallback = pick(REPLACEMENT, wideBytes) ?? hollowBox(2)
  out.set(narrowFallback, NARROW_FALLBACK_OFFSET)
  out.set(wideFallback, WIDE_FALLBACK_OFFSET)

  let missing = 0
  for (let cp = ASCII_FIRST; cp <= ASCII_LAST; cp++) {
    const glyph = pick(cp, narrowBytes)
    if (!glyph) missing++
    out.set(glyph ?? narrowFallback, ASCII_OFFSET + (cp - ASCII_FIRST) * 16)
  }
  for (let cp = CJK_FIRST; cp <= CJK_LAST; cp++) {
    const glyph = pick(cp, wideBytes)
    if (!glyph) missing++
    out.set(glyph ?? wideFallback, CJK_OFFSET + (cp - CJK_FIRST) * 32)
  }

  const target = path.join(import.meta.dir, "..", FONT_PATH)
  writeFileSync(target, out)
  const digest = createHash("sha256").update(out).digest("hex")
  console.log(
    `wrote ${target}: ${out.length} bytes, ${missing} code points fell back, sha256 ${digest}`
  )
}

await main()
