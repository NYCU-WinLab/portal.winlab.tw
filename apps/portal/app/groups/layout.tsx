import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import { GroupsBatchProvider } from "./_components/batch-provider"

export const metadata: Metadata = {
  title: "Groups | Portal",
  description: "管理 Google 郵件群組成員。",
}

export default function GroupsLayout({ children }: { children: ReactNode }) {
  return (
    <GroupsBatchProvider>
      <PortalShell
        appName="Groups"
        appHref="/groups"
        bottomLeft={<Link href="/">Portal</Link>}
      >
        {children}
      </PortalShell>
      {/* Batches and removals each keep a toast going; collapsed, the
          newest would hide the others' progress. */}
      <Toaster expand />
    </GroupsBatchProvider>
  )
}
