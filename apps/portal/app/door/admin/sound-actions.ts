"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import {
  addDefaultSound,
  deleteDefaultSound,
  updateDefaultSound,
  type DefaultSoundMutation,
} from "@/lib/door/default-sound-admin"
import { reloadPanelGreetings } from "@/lib/door/panel"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// Default door sounds on /door/admin. RLS already limits the rows to door
// admins; the explicit check is because the service-role client (upload
// checks, file removal) must never run for anyone else. The panel is nudged
// after the response so a slow or dark panel never delays the save.

const NOT_ADMIN = "只有門禁管理員可以管理預設音效。"

async function doorAdminClient() {
  const supabase = await createClient()
  const { data: isAdmin, error } = await supabase.rpc("is_door_admin")
  if (error) console.error("[door] is_door_admin failed", error.code)
  return isAdmin === true ? supabase : null
}

function done(result: DefaultSoundMutation): DefaultSoundMutation {
  if (result.ok) {
    after(() => reloadPanelGreetings())
    revalidatePath("/door/admin")
  }
  return result
}

// The browser has already uploaded the file into defaults/.
export async function createDefaultSound(input: {
  path: unknown
  label: unknown
}): Promise<DefaultSoundMutation> {
  const supabase = await doorAdminClient()
  if (!supabase) return { ok: false, error: NOT_ADMIN }
  return done(
    await addDefaultSound({ supabase, admin: createAdminClient() }, input)
  )
}

export async function renameDefaultSound(
  id: unknown,
  label: unknown
): Promise<DefaultSoundMutation> {
  const supabase = await doorAdminClient()
  if (!supabase) return { ok: false, error: NOT_ADMIN }
  return done(await updateDefaultSound(supabase, id, { label }))
}

export async function setDefaultSoundEnabled(
  id: unknown,
  enabled: unknown
): Promise<DefaultSoundMutation> {
  const supabase = await doorAdminClient()
  if (!supabase) return { ok: false, error: NOT_ADMIN }
  return done(await updateDefaultSound(supabase, id, { enabled }))
}

export async function removeDefaultSound(
  id: unknown
): Promise<DefaultSoundMutation> {
  const supabase = await doorAdminClient()
  if (!supabase) return { ok: false, error: NOT_ADMIN }
  return done(
    await deleteDefaultSound({ supabase, admin: createAdminClient() }, id)
  )
}
