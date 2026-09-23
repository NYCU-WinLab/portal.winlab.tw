import type { SupabaseClient } from "@supabase/supabase-js"

import { parseDoorGreetingSuffix } from "@/lib/door/greeting-suffix"

export type DoorGreeting = {
  name: string | null
  suffix: string | null
}

export async function fetchDoorGreeting(
  supabase: SupabaseClient,
  userId: string
): Promise<DoorGreeting> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("name, door_greeting_suffix")
    .eq("id", userId)
    .maybeSingle()
  if (error) throw error
  return {
    name: typeof data?.name === "string" ? data.name : null,
    suffix:
      typeof data?.door_greeting_suffix === "string"
        ? data.door_greeting_suffix
        : null,
  }
}

export type SaveSuffixResult =
  | { ok: true; suffix: string | null }
  | { ok: false; error: string }

export const SAVE_SUFFIX_FAILED = "儲存失敗，請重試。"

// Runs with the member's own client, so user_profiles_update_own is what keeps
// the write on their row. A filtered-out row is not an error to PostgREST, so
// ask for the updated id back and treat "nothing updated" as a failure.
export async function updateDoorGreetingSuffix(
  supabase: SupabaseClient,
  userId: string,
  input: unknown
): Promise<SaveSuffixResult> {
  const parsed = parseDoorGreetingSuffix(input)
  if (!parsed.ok) return parsed
  const { data, error } = await supabase
    .from("user_profiles")
    .update({ door_greeting_suffix: parsed.value })
    .eq("id", userId)
    .select("id")
  if (error) {
    console.error("[profile] door greeting suffix save failed", error.code)
    return { ok: false, error: SAVE_SUFFIX_FAILED }
  }
  if (!data || data.length !== 1) {
    return { ok: false, error: SAVE_SUFFIX_FAILED }
  }
  return { ok: true, suffix: parsed.value }
}
