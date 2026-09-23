// The colour of the name line of the door panel's greeting (歡迎 / name /
// suffix), which a member picks on /profile. The same rule is the CHECK on
// user_profiles.door_greeting_color (20260923130000): lower-case #rrggbb with
// at least one channel >= 128, because a dim colour on an LED is barely lit
// rather than a readable dark shade.

import { z } from "zod"

// What the panel draws when a member has not picked one. The service owns it;
// this is only for the preview and the native picker's starting value.
export const DOOR_COLOR_DEFAULT = "#ffffff"
export const DOOR_COLOR_MIN_CHANNEL = 128

export const DOOR_COLOR_PRESETS = [
  { label: "白", value: "#ffffff" },
  { label: "紅", value: "#ff4040" },
  { label: "橘", value: "#ff9900" },
  { label: "黃", value: "#ffe600" },
  { label: "綠", value: "#33ff66" },
  { label: "青", value: "#33e6ff" },
  { label: "藍", value: "#6699ff" },
  { label: "粉", value: "#ff66cc" },
] as const

const HEX_COLOR = /^#[0-9a-f]{6}$/

export const COLOR_INVALID_FORMAT = "顏色格式不正確。"
export const COLOR_TOO_DARK = "太暗了，LED 看板上會看不清楚。"

// Brightest of the three channels, or null when the value is not #rrggbb.
export function maxChannel(color: string): number | null {
  if (!HEX_COLOR.test(color)) return null
  return Math.max(
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16)
  )
}

export function isDoorGreetingColor(value: unknown): value is string {
  if (typeof value !== "string") return false
  const channel = maxChannel(value)
  return channel !== null && channel >= DOOR_COLOR_MIN_CHANNEL
}

// As it will be stored: trimmed, lower-case, and empty means null (the panel
// default).
export function normalizeColorInput(value: string | null | undefined) {
  const trimmed = (value ?? "").trim().toLowerCase()
  return trimmed === "" ? null : trimmed
}

export const doorGreetingColorSchema = z
  .string({ error: COLOR_INVALID_FORMAT })
  .max(16, COLOR_INVALID_FORMAT)
  .nullable()
  .transform(normalizeColorInput)
  .refine((value) => value === null || HEX_COLOR.test(value), {
    message: COLOR_INVALID_FORMAT,
  })
  .refine((value) => value === null || isDoorGreetingColor(value), {
    message: COLOR_TOO_DARK,
  })

export type ColorParseResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

export function parseDoorGreetingColor(input: unknown): ColorParseResult {
  const result = doorGreetingColorSchema.safeParse(input)
  if (result.success) return { ok: true, value: result.data }
  return {
    ok: false,
    error: result.error.issues[0]?.message ?? COLOR_INVALID_FORMAT,
  }
}
