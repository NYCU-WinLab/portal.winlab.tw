import { Skeleton } from "@workspace/ui/components/skeleton"
export default function Loading() {
  return (
    <div className="space-y-6" aria-label="載入中">
      <Skeleton className="h-8 w-60" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
