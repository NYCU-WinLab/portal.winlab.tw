import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { CardManagement } from "./_components/card-management"
import { getControllerHealth, listDoorCards } from "./actions"

export const dynamic = "force-dynamic"

// Door admins and portal super admins only. door_cards' RLS already hides the
// rows from everyone else; the explicit check is so a non-admin sees a 404
// instead of an empty table that looks like a broken page.
export default async function DoorAdminPage() {
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc("is_door_admin")
  if (!isAdmin) notFound()

  const [cards, health, members] = await Promise.all([
    listDoorCards(),
    getControllerHealth(),
    supabase
      .from("user_profiles")
      .select("id, name, email")
      .order("name", { ascending: true }),
  ])

  if (!cards.ok) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-lg font-semibold">門禁卡管理</h1>
        <p className="text-sm text-destructive">載入失敗：{cards.error}</p>
      </div>
    )
  }

  return (
    <CardManagement
      cards={cards.cards}
      controllerError={cards.controllerError}
      health={health.ok ? health.health : null}
      healthError={health.ok ? null : health.error}
      members={members.data ?? []}
    />
  )
}
