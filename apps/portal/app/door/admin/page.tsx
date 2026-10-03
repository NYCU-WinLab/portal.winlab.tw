import { notFound } from "next/navigation"

import {
  listDefaultSounds,
  type DefaultSoundView,
} from "@/lib/door/default-sound-admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

import { CardManagement } from "./_components/card-management"
import { DefaultSounds } from "./_components/default-sounds"
import { getControllerHealth, listDoorCards } from "./actions"

export const dynamic = "force-dynamic"

// Door admins and portal super admins only. door_cards' RLS already hides the
// rows from everyone else; the explicit check is so a non-admin sees a 404
// instead of an empty table that looks like a broken page.
export default async function DoorAdminPage() {
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc("is_door_admin")
  if (!isAdmin) notFound()

  const [cards, health, members, sounds] = await Promise.all([
    listDoorCards(),
    getControllerHealth(),
    supabase
      .from("user_profiles")
      .select("id, name, email")
      .order("name", { ascending: true }),
    loadDefaultSounds(supabase),
  ])

  return (
    <>
      {cards.ok ? (
        <CardManagement
          cards={cards.cards}
          controllerError={cards.controllerError}
          health={health.ok ? health.health : null}
          healthError={health.ok ? null : health.error}
          members={members.data ?? []}
        />
      ) : (
        <div className="mx-auto w-full max-w-4xl px-4 py-8">
          <h1 className="mb-1 text-lg font-semibold">門禁卡管理</h1>
          <p className="text-sm text-destructive">載入失敗：{cards.error}</p>
        </div>
      )}
      <DefaultSounds sounds={sounds.sounds} loadError={sounds.error} />
    </>
  )
}

// A card list the controller cannot load must not hide the sounds, and the
// other way round, so each section fails on its own.
async function loadDefaultSounds(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ sounds: DefaultSoundView[]; error: string | null }> {
  try {
    return {
      sounds: await listDefaultSounds(supabase, createAdminClient()),
      error: null,
    }
  } catch (err) {
    console.error("[door] default sounds read failed", err)
    return { sounds: [], error: "無法讀取預設音效。" }
  }
}
