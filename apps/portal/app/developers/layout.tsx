import type { Metadata } from "next"
import Link from "next/link"
import { PortalShell } from "@/components/portal-shell"
import { Toaster } from "@workspace/ui/components/sonner"
export const metadata: Metadata = {
  title: "Developers | WinLab",
  description: "WinLab 應用程式登入與資料授權平台",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}
export default function DeveloperLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <PortalShell
        appName="Developers"
        appHref="/developers"
        topRight={
          <nav aria-label="開發者平台" className="flex gap-4">
            <Link href="/developers/docs">文件</Link>
            <Link href="/developers/authorizations">我的授權</Link>
          </nav>
        }
        bottomLeft={<Link href="/">Portal</Link>}
      >
        {children}
      </PortalShell>
      <Toaster />
    </>
  )
}
