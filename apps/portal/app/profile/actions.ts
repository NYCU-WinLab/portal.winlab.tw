"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { reloadPanelGreetings } from "@/lib/door/panel"
import {
  updateDoorGreeting,
  type SaveDoorGreetingResult,
} from "@/lib/profile/door-greeting"
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
