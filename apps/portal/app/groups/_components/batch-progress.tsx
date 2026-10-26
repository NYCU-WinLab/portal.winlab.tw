"use client"

import { toast } from "sonner"

import type { BatchJob, JobView } from "@/lib/groups/progress"

// sonner paints a toast from these variables (its close and action buttons
// too), so a tone sets them on the toast itself rather than fighting its
// stylesheet: orange while a batch is being sent, green when it's done.
export const TONE_CLASS: Record<JobView["tone"], string> = {
  queued: "[--normal-text:var(--muted-foreground)]",
  running:
    "[--normal-bg:var(--color-orange-50)] [--normal-border:var(--color-orange-300)] [--normal-text:var(--color-orange-950)] dark:[--normal-bg:var(--color-orange-950)] dark:[--normal-border:var(--color-orange-800)] dark:[--normal-text:var(--color-orange-100)]",
  success:
    "[--normal-bg:var(--color-green-50)] [--normal-border:var(--color-green-300)] [--normal-text:var(--color-green-950)] dark:[--normal-bg:var(--color-green-950)] dark:[--normal-border:var(--color-green-800)] dark:[--normal-text:var(--color-green-100)]",
  failure:
    "[--normal-bg:var(--color-red-50)] [--normal-border:var(--color-red-300)] [--normal-text:var(--color-red-950)] dark:[--normal-bg:var(--color-red-950)] dark:[--normal-border:var(--color-red-800)] dark:[--normal-text:var(--color-red-100)]",
}

export function BatchProgress({
  lines,
  progress,
}: {
  lines: string[]
  progress: { done: number; total: number } | null
}) {
  return (
    <div className="flex flex-col gap-0.5 text-(--normal-text)">
      {lines.map((line, i) => (
        <p key={i} className="break-all">
          {line}
        </p>
      ))}
      {progress && (
        <div
          role="progressbar"
          aria-label="加入進度"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-current/15"
        >
          <div
            className="h-full rounded-full bg-current transition-[width]"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

/** Show a batch's toast, or update it in place: one toast per batch. */
export function showBatchToast(
  job: BatchJob,
  view: JobView,
  onRetry: (groupId: string, emails: string[]) => void
) {
  const id = `groups-batch-${job.id}`
  const description = (
    <BatchProgress lines={view.lines} progress={view.progress} />
  )
  const className = TONE_CLASS[view.tone]
  switch (view.tone) {
    case "queued":
      toast(view.title, { id, description, className, duration: Infinity })
      return
    case "running":
      toast.loading(view.title, {
        id,
        description,
        className,
        duration: Infinity,
      })
      return
    case "success":
      toast.success(view.title, { id, description, className, duration: 5000 })
      return
    case "failure":
      toast.error(view.title, {
        id,
        description,
        className,
        duration: Infinity,
        closeButton: true,
        action: {
          label: `重新加入這 ${view.retry.length} 人`,
          onClick: () => {
            toast.dismiss(id)
            onRetry(job.groupId, view.retry)
          },
        },
      })
      return
  }
}
