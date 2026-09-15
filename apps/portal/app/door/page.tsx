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

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-medium">Door</h1>
        <p className="text-sm text-muted-foreground">
          實驗室門禁。按 Open 觸發一次開門。
        </p>
      </div>
      <DoorPanel configured={configured} initialOnline={online} />
    </div>
  )
}
