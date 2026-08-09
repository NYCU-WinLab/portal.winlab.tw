import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import { QueryProvider } from "./_components/query-provider"

export const metadata: Metadata = {
  title: "Rooms | Portal",
  description: "資工系研討室空檔查詢。",
}

export default function RoomsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <PortalShell
        appName="Rooms"
        appHref="/rooms"
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
