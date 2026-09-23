import { expect, test } from "bun:test"

import { eventSyncNotice } from "@/lib/door/event-status"

const now = Date.parse("2026-09-22T05:00:00Z")
const healthy = {
  enabled: true,
  running: true,
  pending: 0,
  controller_error: null,
  delivery_error: null,
  last_poll_at: "2026-09-22T04:59:58Z",
}

test("healthy sync adds no explanatory UI copy", () => {
  expect(eventSyncNotice(healthy, now)).toBeNull()
})

test("disabled, stopped, stale and undelivered states are visible", () => {
  expect(eventSyncNotice({ enabled: false }, now)).toBe("刷卡同步未啟用")
  expect(eventSyncNotice({ ...healthy, running: false }, now)).toBe(
    "刷卡同步暫停"
  )
  expect(
    eventSyncNotice({ ...healthy, controller_error: "controller_busy" }, now)
  ).toBe("刷卡同步暫停")
  expect(
    eventSyncNotice({ ...healthy, last_poll_at: "2026-09-22T04:00:00Z" }, now)
  ).toBe("刷卡同步暫停")
  expect(
    eventSyncNotice(
      { ...healthy, pending: 2, delivery_error: "portal_unavailable" },
      now
    )
  ).toBe("刷卡紀錄尚未送達")
})

test("malformed responses are not healthy fallbacks", () => {
  expect(() => eventSyncNotice(null, now)).toThrow()
  expect(() => eventSyncNotice({ enabled: true }, now)).toThrow()
  expect(() => eventSyncNotice({ ...healthy, pending: -1 }, now)).toThrow()
})
