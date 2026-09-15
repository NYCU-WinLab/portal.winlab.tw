import { doorConfigured, fetchDoorState } from "@/lib/door/client"

import { DoorPanel } from "./_components/door-panel"

export const dynamic = "force-dynamic"

export default async function DoorPage() {
  const configured = doorConfigured()
  const online = configured
    ? await fetchDoorState().then(
        () => true,
        () => false
      )
    : null

  return <DoorPanel configured={configured} initialOnline={online} />
}
