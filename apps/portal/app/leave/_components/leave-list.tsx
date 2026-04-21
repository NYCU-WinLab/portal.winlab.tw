"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"

import { useLeaves } from "@/hooks/leave/use-leaves"

import { CreateLeaveDialog } from "./create-leave-dialog"
import { LeaveCard } from "./leave-card"

export function LeaveList() {
  const { data: leaves, isLoading } = useLeaves()

  const today = new Date().toISOString().split("T")[0]!
  const upcoming = (leaves ?? []).filter((l) => l.date >= today)
  const past = (leaves ?? []).filter((l) => l.date < today)

  if (isLoading && !leaves) {
    return (
      <div className="flex flex-col gap-10">
        <Skeleton className="h-6 w-32 rounded-md" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">Leave</h1>
          <p className="text-sm text-muted-foreground">
            週一組會請假登記。大家都看得到。
          </p>
        </div>
        <CreateLeaveDialog />
      </div>

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">即將</h2>
          <div className="flex flex-col gap-3">
            {upcoming.map((leave) => (
              <LeaveCard key={leave.id} leave={leave} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">歷史</h2>
          <div className="flex flex-col gap-3">
            {past.map((leave) => (
              <LeaveCard key={leave.id} leave={leave} />
            ))}
          </div>
        </section>
      )}

      {(leaves ?? []).length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          還沒有請假紀錄
        </div>
      )}
    </div>
  )
}
