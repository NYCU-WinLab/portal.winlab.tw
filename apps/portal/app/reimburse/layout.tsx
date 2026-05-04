import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

export const metadata: Metadata = {
  title: "Reimburse | Portal",
  description: "WinLab cash-flow bookkeeping.",
}

export default function ReimburseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <PortalShell
        appName="Reimburse"
        appHref="/reimburse"
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
