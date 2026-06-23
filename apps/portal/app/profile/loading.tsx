import Link from "next/link"

import { ContentSkeleton } from "@/app/_components/content-skeleton"
import { PortalShell } from "@/components/portal-shell"

// profile has no route layout — <PortalShell> lives in page.tsx, so the
// loading fallback has to mount its own shell to avoid a chrome-less flash.
export default function Loading() {
  return (
    <PortalShell
      appName="Profile"
      appHref="/profile"
      bottomLeft={
        <Link href="/" className="transition-colors hover:text-foreground">
          Portal
        </Link>
      }
    >
      <ContentSkeleton />
    </PortalShell>
  )
}
