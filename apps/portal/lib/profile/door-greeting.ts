import type { SupabaseClient } from "@supabase/supabase-js"

import { parseDoorGreetingColor } from "@/lib/door/greeting-color"
import { parseDoorGreetingSuffix } from "@/lib/door/greeting-suffix"

export type DoorGreeting = {
  name: string | null
  suffix: string | null
  color: string | null
}

export async function fetchDoorGreeting(
  supabase: SupabaseClient,
  userId: string
): Promise<DoorGreeting> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("name, door_greeting_suffix, door_greeting_color")
    .eq("id", userId)
    .maybeSingle()
  if (error) throw error
  return {
    name: typeof data?.name === "string" ? data.name : null,
    suffix:
      typeof data?.door_greeting_suffix === "string"
        ? data.door_greeting_suffix
        : null,
    color:
      typeof data?.door_greeting_color === "string"
        ? data.door_greeting_color
        : null,
  }
}

export type DoorGreetingInput = {
  suffix: unknown
  color: unknown
}

export type SaveDoorGreetingResult =
  | { ok: true; suffix: string | null; color: string | null }
  | { ok: false; error: string }

export const SAVE_GREETING_FAILED = "儲存失敗，請重試。"

// Both fields go in one PATCH so one save is one panel reload. Runs with the
// member's own client, so user_profiles_update_own is what keeps the write on
// their row. A filtered-out row is not an error to PostgREST, so ask for the
// updated id back and treat "nothing updated" as a failure.
export async function updateDoorGreeting(
  supabase: SupabaseClient,
  userId: string,
  input: DoorGreetingInput
): Promise<SaveDoorGreetingResult> {
  const suffix = parseDoorGreetingSuffix(input?.suffix)
  if (!suffix.ok) return suffix
  const color = parseDoorGreetingColor(input?.color)
  if (!color.ok) return color
  const { data, error } = await supabase
    .from("user_profiles")
    .update({
      door_greeting_suffix: suffix.value,
      door_greeting_color: color.value,
    })
    .eq("id", userId)
    .select("id")
  if (error) {
    console.error("[profile] door greeting save failed", error.code)
    return { ok: false, error: SAVE_GREETING_FAILED }
  }
  if (!data || data.length !== 1) {
    return { ok: false, error: SAVE_GREETING_FAILED }
  }
  return { ok: true, suffix: suffix.value, color: color.value }
}
