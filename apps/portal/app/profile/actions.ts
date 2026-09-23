"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { reloadPanelGreetings } from "@/lib/door/panel"
import {
  updateDoorGreeting,
  type SaveDoorGreetingResult,
} from "@/lib/profile/door-greeting"
import {
  clearDoorSound,
  removeStaleDoorSounds,
  updateDoorSound,
  type SaveDoorSoundInput,
  type SaveDoorSoundResult,
} from "@/lib/profile/door-sound"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

// The panel service re-reads the greeting maps when nudged; the nudge goes out
// after the response so a slow or dark panel never delays the save.
export async function saveDoorGreeting(input: {
  suffix: unknown
  color: unknown
}): Promise<SaveDoorGreetingResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "請先登入。" }
  const supabase = await createClient()
  const result = await updateDoorGreeting(supabase, user.id, input)
  if (result.ok) {
    after(() => reloadPanelGreetings())
    revalidatePath("/profile")
  }
  return result
}

// The browser uploads straight into the member's folder, then calls this with
// the new path (or no path, to change only the mode). Old files are removed
// and the panel is nudged after the response.
export async function saveDoorSound(
  input: SaveDoorSoundInput
): Promise<SaveDoorSoundResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "請先登入。" }
  const supabase = await createClient()
  const admin = createAdminClient()
  const { previous, ...result } = await updateDoorSound(
    { supabase, admin, userId: user.id },
    input
  )
  if (result.ok) {
    after(async () => {
      await removeStaleDoorSounds(admin, user.id, {
        keep: result.path,
        previous: previous ?? null,
      }).catch((err: unknown) => {
        console.error("[profile] door sound cleanup failed", err)
      })
      await reloadPanelGreetings()
    })
    revalidatePath("/profile")
  }
  return result
}

export async function deleteDoorSound(): Promise<SaveDoorSoundResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "請先登入。" }
  const supabase = await createClient()
  const result = await clearDoorSound(supabase, user.id)
  if (result.ok) {
    after(async () => {
      await removeStaleDoorSounds(createAdminClient(), user.id, {
        keep: null,
        previous: null,
        graceMs: 0,
      }).catch((err: unknown) => {
        console.error("[profile] door sound cleanup failed", err)
      })
      await reloadPanelGreetings()
    })
    revalidatePath("/profile")
  }
  return result
}
