import { notFound } from "next/navigation"

import { listDoorEvents } from "@/lib/door/audit"
import { fetchEventSyncNotice } from "@/lib/door/hams"
import { createClient } from "@/lib/supabase/server"

import { DoorLog } from "./_components/door-log"

export const dynamic = "force-dynamic"

// Door admins only (portal super admins included). The table's RLS already
// hides rows from everyone else; the explicit check is so a non-admin sees a
// 404 instead of an empty log.
export default async function DoorLogPage() {
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc("is_door_admin")
  if (!isAdmin) notFound()

  const [events, syncNotice] = await Promise.all([
    listDoorEvents(supabase),
    fetchEventSyncNotice(),
  ])
  return <DoorLog events={events} syncNotice={syncNotice} />
}
