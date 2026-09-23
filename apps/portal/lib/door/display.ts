// What the door's 32x32 LED panel shows after a portal unlock: the member's
// name, rendered to the 1-bit bitmap POST /api/show expects (128 bytes,
// row-major, 4 bytes per row, MSB first, 1 = lit).

import {
  GLYPH_HEIGHT,
  isNarrowCodePoint,
  loadFont,
  type Font,
  type Glyph,
} from "@/lib/door/font"

export const DISPLAY_SIZE = 32
export const BITMAP_BYTES = (DISPLAY_SIZE * DISPLAY_SIZE) / 8

const MAX_LATIN_CHARS = 8
const MAX_HAN_CHARS = 4

// Keycloak's full_name is "<given> <family>", which for Chinese names comes
// out as "詠翔 詹". The same rule runs in SQL in handle_new_user().
const HAN_GIVEN_FAMILY = /^(\p{Script=Han}+) (\p{Script=Han}+)$/u
const HAN = /\p{Script=Han}/u

export function swapHanGivenFamily(name: string): string {
  const match = HAN_GIVEN_FAMILY.exec(name)
  return match ? `${match[2]}${match[1]}` : name
}

// `profileName` is user_profiles.name, the cleaned display name; the JWT name
// is only a fallback because it carries the given-first order and whatever
// spelling Keycloak has.
export function doorDisplayName(
  profileName: string | null | undefined,
  fallbackName: string | null | undefined
): string {
  const source =
    [profileName, fallbackName]
      .map((value) => value?.trim().replace(/\s+/g, " ") ?? "")
      .find(Boolean) ?? ""
  const name = swapHanGivenFamily(source)

  if (HAN.test(name)) {
    return Array.from(name.replace(/\s/g, "")).slice(0, MAX_HAN_CHARS).join("")
  }

  const first = name.split(/[\s@]/)[0] ?? ""
  // Fold accents so "José" draws as "Jose" instead of a fallback box.
  const ascii = first
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7e]/g, "")
  return Array.from(ascii || first)
    .slice(0, ascii ? MAX_LATIN_CHARS : MAX_HAN_CHARS)
    .join("")
}

function setPixel(bitmap: Uint8Array, x: number, y: number) {
  if (x < 0 || y < 0 || x >= DISPLAY_SIZE || y >= DISPLAY_SIZE) return
  const index = y * (DISPLAY_SIZE / 8) + (x >> 3)
  bitmap[index] = (bitmap[index] ?? 0) | (0x80 >> (x & 7))
}

function drawGlyph(bitmap: Uint8Array, glyph: Glyph, x0: number, y0: number) {
  const bytesPerRow = glyph.width / 8
  for (let row = 0; row < GLYPH_HEIGHT; row++) {
    for (let col = 0; col < glyph.width; col++) {
      const byte = glyph.rows[row * bytesPerRow + (col >> 3)] ?? 0
      if (byte & (0x80 >> (col & 7))) setPixel(bitmap, x0 + col, y0 + row)
    }
  }
}

// Han (or any non-ASCII) labels use 16x16 cells: up to 2 per row. One row
// sits centred; two rows are left-aligned so a third character starts under
// the first. ASCII labels use 8x16 cells, up to 4 per row, each row centred.
// One row is vertically centred (y = 8), two rows sit at y = 0 and y = 16.
export function renderNameBitmap(
  label: string,
  font: Font = loadFont()
): Uint8Array {
  const bitmap = new Uint8Array(BITMAP_BYTES)
  const codePoints = Array.from(label, (ch) => ch.codePointAt(0) ?? 0)
  const wide = codePoints.some((cp) => !isNarrowCodePoint(cp))
  const cell = wide ? 16 : 8
  const perRow = DISPLAY_SIZE / cell
  const shown = codePoints.slice(0, perRow * 2)
  const rows =
    shown.length <= perRow
      ? [shown]
      : [shown.slice(0, perRow), shown.slice(perRow)]

  rows.forEach((row, rowIndex) => {
    const y =
      rows.length === 1 ? (DISPLAY_SIZE - GLYPH_HEIGHT) / 2 : rowIndex * 16
    const x0 =
      wide && rows.length === 2 ? 0 : (DISPLAY_SIZE - row.length * cell) / 2
    row.forEach((cp, i) => {
      const glyph = font.glyph(cp)
      // An ASCII character inside a wide label sits centred in its cell.
      const inset = (cell - glyph.width) / 2
      drawGlyph(bitmap, glyph, x0 + i * cell + inset, y)
    })
  })
  return bitmap
}

export function bitmapToAscii(bitmap: Uint8Array, on = "#", off = "."): string {
  const lines: string[] = []
  for (let y = 0; y < DISPLAY_SIZE; y++) {
    let line = ""
    for (let x = 0; x < DISPLAY_SIZE; x++) {
      const byte = bitmap[y * (DISPLAY_SIZE / 8) + (x >> 3)] ?? 0
      line += byte & (0x80 >> (x & 7)) ? on : off
    }
    lines.push(line)
  }
  return lines.join("\n")
}
