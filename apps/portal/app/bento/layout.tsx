import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import { QueryProvider } from "./_components/query-provider"
import { RealtimeNotifications } from "./_components/realtime-notifications"

export const metadata: Metadata = {
  title: "Bento | Portal",
  description: "NYCU WinLab ordering system.",
}

export default function BentoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <RealtimeNotifications />
      <PortalShell
        appName="Bento"
        appHref="/bento"
        topRight={
          <nav>
            <Link
              href="/bento/menus"
              className="transition-colors hover:text-foreground"
            >
              Menu
            </Link>
          </nav>
        }
        bottomLeft={
          <Link href="/" className="transition-colors hover:text-foreground">
            Portal
          </Link>
        }
      >
        {children}
      </PortalShell>
      <Toaster />
    </QueryProvider>
  )
}
