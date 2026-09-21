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

// The top-right corner links to card management and the audit log, and only
// for door admins: both pages 404 for everyone else, so showing the links
// would be a dead end. Portal super admins satisfy is_door_admin() too.
export default async function DoorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc("is_door_admin")

  return (
    <>
      <PortalShell
        appName="Door"
        appHref="/"
        containerClassName="p-0"
        topRight={
          isAdmin ? (
            <span className="flex gap-4">
              <Link
                href="/door/admin"
                className="transition-colors hover:text-foreground"
              >
                Admin
              </Link>
              <Link
                href="/door/log"
                className="transition-colors hover:text-foreground"
              >
                Log
              </Link>
            </span>
          ) : undefined
        }
      >
        {children}
      </PortalShell>
      <Toaster />
    </>
  )
}
