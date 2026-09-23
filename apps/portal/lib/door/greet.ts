// After an unlock, from the /door button or a physical card, the lab's LED
// panel shows who opened the door. Callers run this inside after(), so neither
// the press nor the card bridge waits on the profile read or the panel.

import { doorDisplayName, renderNameBitmap } from "@/lib/door/display"
import { panelConfigured, showOnPanel } from "@/lib/door/panel"
import { createAdminClient } from "@/lib/supabase/admin"

export type GreetOptions = {
  profileTimeoutMs?: number
}

// Service-role read of one column: for the id getCurrentUser() already
// verified, or the holder_user_id of a card. It is the same client the audit
// writes use, and it does not depend on request cookies still being readable
// once the response has gone out (the card path has no cookies at all).
//
// Bounded, because a hung PostgREST would otherwise keep after() and the
// function instance alive; on timeout the caller falls back to the JWT name.
// A plain abort() (an AbortError) plus retry(false) is deliberate:
// postgrest-js retries a GET that fails with anything else, including the
// TimeoutError that AbortSignal.timeout() raises.
async function fetchProfileName(
  userId: string,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const { data, error } = await createAdminClient()
      .from("user_profiles")
      .select("name")
      .eq("id", userId)
      .abortSignal(controller.signal)
      .retry(false)
      .maybeSingle()
    if (error) {
      console.error("[door] profile name lookup failed", error.message)
      return null
    }
    const name: unknown = data?.name
    return typeof name === "string" ? name : null
  } finally {
    clearTimeout(timer)
  }
}

export type PanelGreeting = {
  // user_profiles id whose cleaned name is preferred, if there is one.
  userId: string | null
  // The JWT name for a /door press, the card's holder_name for a swipe.
  fallbackName: string | null
}

// Never throws: a missing name on the panel is not worth an error anywhere.
export async function greetOnPanel(
  { userId, fallbackName }: PanelGreeting,
  { profileTimeoutMs = 3000 }: GreetOptions = {}
): Promise<void> {
  try {
    if (!panelConfigured()) return
    const profileName = userId
      ? await fetchProfileName(userId, profileTimeoutMs)
      : null
    const label = doorDisplayName(profileName, fallbackName)
    if (!label) return
    await showOnPanel(renderNameBitmap(label))
  } catch (err) {
    console.error("[door] greeting failed", err)
  }
}
