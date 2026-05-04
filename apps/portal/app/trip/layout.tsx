import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import { QueryProvider } from "./_components/query-provider"
import { TripTopRight } from "./_components/trip-top-right"

export const metadata: Metadata = {
  title: "Trip | Portal",
  description: "NYCU WinLab 出差文件上傳。",
}

export default function TripLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <PortalShell
        appName="Trip"
        appHref="/trip"
        topRight={<TripTopRight />}
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
