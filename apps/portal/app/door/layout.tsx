import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"
import { createClient } from "@/lib/supabase/server"

import "./door.css"

export const metadata: Metadata = {
  title: "Door | Portal",
  description: "實驗室門禁開關。",
}

// The top-right corner links to the audit log, and only for portal admins:
// /door/log 404s for everyone else, so showing the link would be a dead end.
export default async function DoorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc("is_portal_admin")

  return (
    <>
      <PortalShell
        appName="Door"
        appHref="/"
        containerClassName="p-0"
        topRight={
          isAdmin ? (
            <Link
              href="/door/log"
              className="transition-colors hover:text-foreground"
            >
              Log
            </Link>
          ) : undefined
        }
      >
        {children}
      </PortalShell>
      <Toaster />
    </>
  )
}
