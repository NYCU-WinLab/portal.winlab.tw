import { doorConfigured, fetchDoorState } from "@/lib/door/client"

import { DoorPanel } from "../_components/door-panel"

export const dynamic = "force-dynamic"

// What the installed home-screen icon launches (the manifest's start_url), so
// one tap on the icon is one open. /door stays the version you press yourself,
// which is what a browser visit gets — a link someone follows must never open
// the door on its own.
export default async function DoorGoPage() {
  const configured = doorConfigured()
  const online = configured
    ? await fetchDoorState().then(
        () => true,
        () => false
      )
    : null

  return <DoorPanel configured={configured} initialOnline={online} autoOpen />
}
