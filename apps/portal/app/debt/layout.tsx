import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import { QueryProvider } from "./_components/query-provider"

export const metadata: Metadata = {
  title: "Debt | Portal",
  description: "WinLab bill-splitting.",
}

export default function DebtLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <PortalShell
        appName="Debt"
        appHref="/debt"
        topRight={
          <nav>
            <Link
              href="/debt/settlements"
              className="transition-colors hover:text-foreground"
            >
              Settlements
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
