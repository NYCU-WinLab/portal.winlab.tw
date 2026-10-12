import type { Metadata } from "next"
import Link from "next/link"

import { PortalShell } from "@/components/portal-shell"

export const metadata: Metadata = {
  title: "Directory | Portal",
  description: "實驗室成員通訊錄",
  robots: { index: false, follow: false },
}

export default function DirectoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PortalShell
      appName="Directory"
      appHref="/directory"
      containerClassName="max-w-5xl"
      bottomLeft={<Link href="/">Portal</Link>}
    >
      {children}
    </PortalShell>
  )
}
