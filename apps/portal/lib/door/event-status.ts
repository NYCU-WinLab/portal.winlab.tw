export class EventStatusError extends Error {}

export function eventSyncNotice(
  status: unknown,
  now = Date.now()
): string | null {
  if (typeof status !== "object" || status === null || !("enabled" in status)) {
    throw new EventStatusError("Invalid event sync status")
  }
  if (status.enabled === false) return "刷卡同步未啟用"
  if (
    status.enabled !== true ||
    !("running" in status) ||
    typeof status.running !== "boolean" ||
    !("pending" in status) ||
    typeof status.pending !== "number" ||
    !Number.isSafeInteger(status.pending) ||
    status.pending < 0 ||
    !("controller_error" in status) ||
    (status.controller_error !== null &&
      typeof status.controller_error !== "string") ||
    !("delivery_error" in status) ||
    (status.delivery_error !== null &&
      typeof status.delivery_error !== "string") ||
    !("last_poll_at" in status) ||
    (status.last_poll_at !== null && typeof status.last_poll_at !== "string")
  ) {
    throw new EventStatusError("Invalid event sync status")
  }
  if (!status.running || status.controller_error) return "刷卡同步暫停"
  if (status.delivery_error) return "刷卡紀錄尚未送達"
  if (status.last_poll_at === null) return "刷卡同步啟動中"
  const lastPoll = Date.parse(status.last_poll_at)
  if (!Number.isFinite(lastPoll) || Math.abs(now - lastPoll) > 60_000) {
    return "刷卡同步暫停"
  }
  return status.pending ? `刷卡紀錄同步中（${status.pending}）` : null
}
