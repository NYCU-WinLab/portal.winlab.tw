// After a portal unlock, the lab's LED panel shows who opened the door. Runs
// inside after(), so the press never waits on the profile read or the panel.

import { doorDisplayName, renderNameBitmap } from "@/lib/door/display"
import { panelConfigured, showOnPanel } from "@/lib/door/panel"
import { createAdminClient } from "@/lib/supabase/admin"
import type { NormalizedUser } from "@/lib/user"

export type GreetOptions = {
  profileTimeoutMs?: number
}

// Service-role read of one column for the id getCurrentUser() already
// verified: the same client recordDoorEvent uses, and it does not depend on
// request cookies still being readable once the response has gone out.
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

// Never throws: a missing name on the panel is not worth an error anywhere.
export async function greetOnDoor(
  user: NormalizedUser,
  { profileTimeoutMs = 3000 }: GreetOptions = {}
): Promise<void> {
  try {
    if (!panelConfigured()) return
    const profileName = await fetchProfileName(user.id, profileTimeoutMs)
    const label = doorDisplayName(profileName, user.name)
    if (!label) return
    await showOnPanel(renderNameBitmap(label))
  } catch (err) {
    console.error("[door] greeting failed", err)
  }
}
