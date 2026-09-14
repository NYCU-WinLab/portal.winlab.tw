import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

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
      <PortalShell
        appName="Door"
        appHref="/door"
        bottomLeft={
          <Link href="/" className="transition-colors hover:text-foreground">
            Portal
          </Link>
        }
      >
        {children}
      </PortalShell>
      <Toaster />
    </>
  )
}
