// The third line of the door panel's greeting (歡迎 / name / suffix), which a
// member sets on /profile. The panel font draws Han and other full-width
// glyphs 10 px wide and printable ASCII 5 px wide, on a 32 px line. The same
// rule is the CHECK on user_profiles.door_greeting_suffix
// (20260923120000); this side rejects a superset of what that check does, so
// anything accepted here always saves.

import { z } from "zod"

export const DOOR_SUFFIX_MAX_WIDTH = 32
export const DOOR_SUFFIX_DEFAULT = "！！"

const WIDE_PX = 10
const NARROW_PX = 5

// Control, format (zero-width, bidi overrides), surrogate, private-use and
// unassigned code points, plus the line and paragraph separators. None of them
// draw anything sensible on a 1-bit panel.
const DISALLOWED = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u

export function suffixWidth(text: string): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    width += code >= 0x20 && code <= 0x7e ? NARROW_PX : WIDE_PX
  }
  return width
}

export function hasDisallowedCharacter(text: string): boolean {
  return DISALLOWED.test(text)
}

export const SUFFIX_TOO_WIDE = "太長了，最多 3 個中文字或 6 個英數字。"
export const SUFFIX_INVALID_CHARACTER = "含有看板無法顯示的字元。"
export const SUFFIX_INVALID_INPUT = "格式不正確。"

// What the member typed, as it will be stored: NFC, trimmed, and empty means
// null (the panel default).
export function normalizeSuffixInput(value: string | null | undefined) {
  const trimmed = (value ?? "").normalize("NFC").trim()
  return trimmed === "" ? null : trimmed
}

export const doorGreetingSuffixSchema = z
  .string({ error: SUFFIX_INVALID_INPUT })
  // Bounds the work before normalising; anything this long is over width.
  .max(64, SUFFIX_TOO_WIDE)
  .nullable()
  .transform(normalizeSuffixInput)
  .refine((value) => value === null || !hasDisallowedCharacter(value), {
    message: SUFFIX_INVALID_CHARACTER,
  })
  .refine(
    (value) => value === null || suffixWidth(value) <= DOOR_SUFFIX_MAX_WIDTH,
    { message: SUFFIX_TOO_WIDE }
  )

export type SuffixParseResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

export function parseDoorGreetingSuffix(input: unknown): SuffixParseResult {
  const result = doorGreetingSuffixSchema.safeParse(input)
  if (result.success) return { ok: true, value: result.data }
  return {
    ok: false,
    error: result.error.issues[0]?.message ?? SUFFIX_INVALID_INPUT,
  }
}
