import { Skeleton } from "@workspace/ui/components/skeleton"

// Shared route-level loading fallback. Sits inside each app's <PortalShell>
// (mounted in the route layout), so it only renders the content-area skeleton.
export function ContentSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-6 w-32 rounded-md" />
        <Skeleton className="h-4 w-56 rounded-md" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
