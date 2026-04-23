"use client"

export type SaveStatus = "idle" | "saving" | "saved" | "error"

export function SaveIndicator({
  status,
  at,
}: {
  status: SaveStatus
  at: Date | null
}) {
  if (status === "saving") {
    return <span className="text-xs text-muted-foreground">儲存中...</span>
  }
  if (status === "error") {
    return <span className="text-xs text-destructive">儲存失敗</span>
  }
  if (status === "saved" && at) {
    return (
      <span className="text-xs text-muted-foreground">
        已儲存 · {relative(at)}
      </span>
    )
  }
  return null
}

function relative(at: Date): string {
  const diff = Date.now() - at.getTime()
  if (diff < 10_000) return "剛才"
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`
  return `${Math.floor(diff / 60_000)} 分前`
}
