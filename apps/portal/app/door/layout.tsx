import type { Metadata } from "next"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import "./door.css"

export const metadata: Metadata = {
  title: "Door | Portal",
  description: "實驗室門禁開關。",
}

export default function DoorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <PortalShell appName="Door" appHref="/" containerClassName="p-0">
        {children}
      </PortalShell>
      <Toaster />
    </>
  )
}
