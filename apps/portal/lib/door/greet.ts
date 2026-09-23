// After a portal unlock, the door's LED panel shows who opened it. Runs inside
// after(), so the press never waits on the profile read or the board.

import { showOnDoor } from "@/lib/door/client"
import { doorDisplayName, renderNameBitmap } from "@/lib/door/display"
import { createAdminClient } from "@/lib/supabase/admin"
import type { NormalizedUser } from "@/lib/user"

// Service-role read of one column for the id getCurrentUser() already
// verified: the same client recordDoorEvent uses, and it does not depend on
// request cookies still being readable once the response has gone out.
async function fetchProfileName(userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("user_profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle()
  if (error) {
    console.error("[door] profile name lookup failed", error.message)
    return null
  }
  const name: unknown = data?.name
  return typeof name === "string" ? name : null
}

// Never throws: a missing name on the panel is not worth an error anywhere.
export async function greetOnDoor(user: NormalizedUser): Promise<void> {
  try {
    const label = doorDisplayName(await fetchProfileName(user.id), user.name)
    if (!label) return
    await showOnDoor(renderNameBitmap(label))
  } catch (err) {
    console.error("[door] greeting failed", err)
  }
}
