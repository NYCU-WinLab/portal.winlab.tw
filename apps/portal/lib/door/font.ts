// Bitmap font for the door display: a subset of GNU Unifont (see
// lib/door/font/LICENSE-unifont.txt), built by scripts/build-unifont-subset.ts.
//
// The file is a flat array of glyph rows with no header, in this order:
//   ASCII 0x20-0x7E        95 glyphs x 16 bytes (8x16, 1 byte per row)
//   narrow fallback         1 glyph  x 16 bytes
//   wide fallback           1 glyph  x 32 bytes (16x16, 2 bytes per row)
//   CJK 0x4E00-0x9FFF   20992 glyphs x 32 bytes
// Rows are top to bottom, MSB first, 1 = lit: the same bit order the board
// wants, so drawing a glyph is copying bits.

import { readFileSync } from "node:fs"
import path from "node:path"

export const GLYPH_HEIGHT = 16
export const ASCII_FIRST = 0x20
export const ASCII_LAST = 0x7e
export const CJK_FIRST = 0x4e00
export const CJK_LAST = 0x9fff

const NARROW_BYTES = GLYPH_HEIGHT
const WIDE_BYTES = GLYPH_HEIGHT * 2

export const ASCII_OFFSET = 0
export const NARROW_FALLBACK_OFFSET =
  ASCII_OFFSET + (ASCII_LAST - ASCII_FIRST + 1) * NARROW_BYTES
export const WIDE_FALLBACK_OFFSET = NARROW_FALLBACK_OFFSET + NARROW_BYTES
export const CJK_OFFSET = WIDE_FALLBACK_OFFSET + WIDE_BYTES
export const FONT_BYTES = CJK_OFFSET + (CJK_LAST - CJK_FIRST + 1) * WIDE_BYTES

// Relative to the portal app root, which is the cwd under `next start`, on
// Vercel, and for `bun test` in apps/portal.
export const FONT_PATH = "lib/door/font/unifont-subset.bin"

export type Glyph = {
  width: 8 | 16
  // GLYPH_HEIGHT rows of width / 8 bytes each.
  rows: Uint8Array
}

export type Font = {
  glyph(codePoint: number): Glyph
}

export function isNarrowCodePoint(codePoint: number): boolean {
  return codePoint >= ASCII_FIRST && codePoint <= ASCII_LAST
}

export function parseFont(data: Uint8Array): Font {
  if (data.length !== FONT_BYTES) {
    throw new Error(
      `Door font is ${data.length} bytes, expected ${FONT_BYTES}; rebuild it with scripts/build-unifont-subset.ts`
    )
  }
  const narrow = (offset: number): Glyph => ({
    width: 8,
    rows: data.subarray(offset, offset + NARROW_BYTES),
  })
  const wide = (offset: number): Glyph => ({
    width: 16,
    rows: data.subarray(offset, offset + WIDE_BYTES),
  })
  return {
    glyph(codePoint) {
      if (isNarrowCodePoint(codePoint)) {
        return narrow(ASCII_OFFSET + (codePoint - ASCII_FIRST) * NARROW_BYTES)
      }
      if (codePoint >= CJK_FIRST && codePoint <= CJK_LAST) {
        return wide(CJK_OFFSET + (codePoint - CJK_FIRST) * WIDE_BYTES)
      }
      return wide(WIDE_FALLBACK_OFFSET)
    },
  }
}

// The glyph data is immutable, so one parsed copy per instance is fine to
// share across requests (unlike a Supabase client).
let cached: Font | undefined

export function loadFont(): Font {
  // Keep the path a literal: the output tracer resolves this exact expression
  // to the one file. Anything it cannot evaluate statically (a variable, a
  // loop over candidates) makes it trace the whole project into the function.
  cached ??= parseFont(
    new Uint8Array(
      readFileSync(path.join(process.cwd(), "lib/door/font/unifont-subset.bin"))
    )
  )
  return cached
}
