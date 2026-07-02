import { ContentSkeleton } from "@/app/_components/content-skeleton"
import { PortalShell } from "@/components/portal-shell"

// bulletin detail mounts <PortalShell> in the page (no shell in the route
// layout), so the loading fallback has to provide its own chrome.
export default function Loading() {
  return (
    <PortalShell appName="公布欄">
      <ContentSkeleton />
    </PortalShell>
  )
}
