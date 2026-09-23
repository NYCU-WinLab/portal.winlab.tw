import { describe, expect, test } from "bun:test"

import {
  BITMAP_BYTES,
  bitmapToAscii,
  doorDisplayName,
  renderNameBitmap,
  swapHanGivenFamily,
} from "@/lib/door/display"
import {
  FONT_BYTES,
  isNarrowCodePoint,
  loadFont,
  type Font,
} from "@/lib/door/font"

// Every glyph lights exactly its top-left and bottom-right pixel, so a
// rendered bitmap says precisely where each cell landed.
const cornerFont: Font = {
  glyph(cp) {
    if (isNarrowCodePoint(cp)) {
      const rows = new Uint8Array(16)
      rows[0] = 0x80
      rows[15] = 0x01
      return { width: 8, rows }
    }
    const rows = new Uint8Array(32)
    rows[0] = 0x80
    rows[31] = 0x01
    return { width: 16, rows }
  },
}

function litPixels(bitmap: Uint8Array): string[] {
  const out: string[] = []
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if ((bitmap[y * 4 + (x >> 3)] ?? 0) & (0x80 >> (x & 7))) {
        out.push(`${x},${y}`)
      }
    }
  }
  return out
}

const sorted = (pixels: string[]) =>
  [...pixels].sort((a, b) => {
    const [ax, ay] = a.split(",").map(Number)
    const [bx, by] = b.split(",").map(Number)
    return (ay ?? 0) - (by ?? 0) || (ax ?? 0) - (bx ?? 0)
  })

describe("doorDisplayName", () => {
  test("keeps a clean Han profile name", () => {
    expect(doorDisplayName("詹詠翔", "詠翔 詹")).toBe("詹詠翔")
    expect(doorDisplayName("郭愷", null)).toBe("郭愷")
  })

  test("puts the family name first for a Han 'given family' name", () => {
    expect(swapHanGivenFamily("詠翔 詹")).toBe("詹詠翔")
    expect(swapHanGivenFamily("娜娜 歐陽")).toBe("歐陽娜娜")
    expect(doorDisplayName("詠翔 詹", null)).toBe("詹詠翔")
    expect(doorDisplayName(null, "詠翔 詹")).toBe("詹詠翔")
  })

  test("uses the first Latin word, at most 8 characters", () => {
    expect(doorDisplayName("Simon Chu", "Simon Chu")).toBe("Simon")
    expect(doorDisplayName("AUNG KYAW HTIN", null)).toBe("AUNG")
    expect(doorDisplayName("Christopher Lee", null)).toBe("Christop")
    expect(doorDisplayName("José Chen", null)).toBe("Jose")
  })

  test("falls back to the JWT name, then to an email local part", () => {
    expect(doorDisplayName("", "Mike Liao")).toBe("Mike")
    expect(doorDisplayName("  ", "Mike Liao")).toBe("Mike")
    expect(doorDisplayName(null, "loki@winlab.tw")).toBe("loki")
    expect(doorDisplayName(null, null)).toBe("")
  })

  test("caps Han names at 4 characters", () => {
    expect(doorDisplayName("司馬相如某", null)).toBe("司馬相如")
  })
})

describe("renderNameBitmap layout", () => {
  test("bit order: pixel (0,0) is bit 7 of byte 0", () => {
    const bitmap = renderNameBitmap("詹詠翔", cornerFont)
    expect(bitmap.length).toBe(BITMAP_BYTES)
    expect(bitmap[0]).toBe(0x80)
    // (31,15): row 15, byte 3, bit 0.
    expect(bitmap[15 * 4 + 3]).toBe(0x01)
  })

  test("one Han character is centred both ways", () => {
    expect(litPixels(renderNameBitmap("詹", cornerFont))).toEqual(
      sorted(["8,8", "23,23"])
    )
  })

  test("two Han characters share one row at y = 8", () => {
    expect(litPixels(renderNameBitmap("郭愷", cornerFont))).toEqual(
      sorted(["0,8", "15,23", "16,8", "31,23"])
    )
  })

  test("three Han characters wrap to a left-aligned second row", () => {
    expect(litPixels(renderNameBitmap("詹詠翔", cornerFont))).toEqual(
      sorted(["0,0", "15,15", "16,0", "31,15", "0,16", "15,31"])
    )
  })

  test("only the first 4 Han characters are drawn", () => {
    expect(litPixels(renderNameBitmap("司馬相如某", cornerFont))).toEqual(
      litPixels(renderNameBitmap("司馬相如", cornerFont))
    )
  })

  test("a short Latin name is one centred row of 8x16 cells", () => {
    expect(litPixels(renderNameBitmap("Bob", cornerFont))).toEqual(
      sorted(["4,8", "11,23", "12,8", "19,23", "20,8", "27,23"])
    )
  })

  test("a Latin name over 4 characters wraps, each row centred", () => {
    expect(litPixels(renderNameBitmap("Simon", cornerFont))).toEqual(
      sorted([
        "0,0",
        "7,15",
        "8,0",
        "15,15",
        "16,0",
        "23,15",
        "24,0",
        "31,15",
        "12,16",
        "19,31",
      ])
    )
  })

  test("an empty label is a dark panel", () => {
    expect(litPixels(renderNameBitmap("", cornerFont))).toEqual([])
  })
})

describe("Unifont subset", () => {
  const font = loadFont()

  test("real glyphs land where the layout says", () => {
    const glyph = font.glyph("郭".codePointAt(0)!)
    const bitmap = renderNameBitmap("郭", font)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const want = (glyph.rows[y * 2 + (x >> 3)] ?? 0) & (0x80 >> (x & 7))
        const px = x + 8
        const py = y + 8
        const got = (bitmap[py * 4 + (px >> 3)] ?? 0) & (0x80 >> (px & 7))
        expect(Boolean(got)).toBe(Boolean(want))
      }
    }
  })

  test("covers ASCII and CJK, and falls back outside them", () => {
    expect(font.glyph(0x41).width).toBe(8)
    expect(font.glyph(0x41).rows.some(Boolean)).toBe(true)
    expect(font.glyph(0x8a60).width).toBe(16)
    expect(font.glyph(0x8a60).rows.some(Boolean)).toBe(true)
    expect(font.glyph(0xac00).rows).toEqual(font.glyph(0x1f600).rows)
    expect(font.glyph(0xac00).rows).not.toEqual(font.glyph(0x8a60).rows)
  })

  test("the subset stays under 700 KB", () => {
    expect(FONT_BYTES).toBeLessThan(700_000)
  })

  test("bitmapToAscii prints 32 lines of 32 cells", () => {
    const lines = bitmapToAscii(renderNameBitmap("Simon", font)).split("\n")
    expect(lines.length).toBe(32)
    expect(lines.every((line) => line.length === 32)).toBe(true)
  })
})
