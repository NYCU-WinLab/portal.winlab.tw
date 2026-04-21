import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import { QueryProvider } from "./_components/query-provider"

export const metadata: Metadata = {
  title: "Leave | Portal",
  description: "NYCU WinLab leave tracker.",
}

export default function LeaveLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <PortalShell
        appName="Leave"
        appHref="/leave"
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
