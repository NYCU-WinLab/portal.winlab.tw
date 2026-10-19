import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import { QueryProvider } from "./_components/query-provider"

export const metadata: Metadata = {
  title: "Groups | Portal",
  description: "管理 Google 郵件群組成員。",
}

export default function GroupsLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <PortalShell
        appName="Groups"
        appHref="/groups"
        bottomLeft={<Link href="/">Portal</Link>}
      >
        {children}
      </PortalShell>
      <Toaster />
    </QueryProvider>
  )
}
