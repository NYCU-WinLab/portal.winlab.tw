import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import { QueryProvider } from "./_components/query-provider"

export const metadata: Metadata = {
  title: "Meetings | Portal",
  description: "WinLab weekly meeting schedule.",
}

export default function MeetingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <PortalShell
        appName="Meetings"
        appHref="/meetings"
        containerClassName="max-w-6xl"
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
