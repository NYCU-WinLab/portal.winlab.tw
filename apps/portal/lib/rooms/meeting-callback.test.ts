import { describe, expect, test } from "bun:test"

import { isRetryable, readCallback } from "./meeting-callback"

const PIPELINE = { id: "4821", url: "https://gitlab.winlab.tw/p/4821" }
const JOIN_URL = "https://teams.microsoft.com/l/meetup-join/abc"

function success(overrides: Record<string, unknown> = {}) {
  return {
    request_id: "room-booking-8f3a1c",
    status: "success",
    stage: "done",
    meeting: {
      event_id: "evt-1",
      ical_uid: "040000008200E00074C5B7101A82E008",
      thread_id: "19:xxx@thread.tacv2",
      join_url: JOIN_URL,
      web_link: "https://teams.microsoft.com/web",
    },
    options_applied: true,
    error: null,
    pipeline: PIPELINE,
    ...overrides,
  }
}

describe("readCallback", () => {
  test("reads a successful meeting", () => {
    const read = readCallback(success())
    expect(read.ok).toBe(true)
    if (!read.ok) return

    expect(read.requestId).toBe("room-booking-8f3a1c")
    expect(read.outcome.kind).toBe("success")
    if (read.outcome.kind !== "success") return
    expect(read.outcome.joinUrl).toBe(JOIN_URL)
    expect(read.outcome.eventId).toBe("evt-1")
    expect(read.outcome.threadId).toBe("19:xxx@thread.tacv2")
    expect(read.outcome.optionsApplied).toBe(true)
    expect(read.outcome.pipeline.id).toBe("4821")
  })

  // The case the integration notes call out by name: the meeting exists, only
  // its options didn't apply. Re-triggering would create a duplicate meeting,
  // so this must not read as a failure however `status` is set.
  test("OPTIONS_FAILED with a join_url is a success", () => {
    const read = readCallback(
      success({
        status: "failed",
        stage: "options",
        options_applied: false,
        error: { code: "OPTIONS_FAILED", message: "options endpoint 500" },
      })
    )
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.outcome.kind).toBe("success")
    if (read.outcome.kind !== "success") return
    expect(read.outcome.joinUrl).toBe(JOIN_URL)
    expect(read.outcome.optionsApplied).toBe(false)
  })

  test("OPTIONS_FAILED still reports options as not applied when the flag says otherwise", () => {
    const read = readCallback(
      success({
        options_applied: true,
        error: { code: "OPTIONS_FAILED", message: "options endpoint 500" },
      })
    )
    expect(read.ok).toBe(true)
    if (!read.ok) return
    if (read.outcome.kind !== "success") throw new Error("expected success")
    expect(read.outcome.optionsApplied).toBe(false)
  })

  test("reads a failure", () => {
    const read = readCallback({
      request_id: "room-booking-8f3a1c",
      status: "failed",
      stage: "login",
      meeting: null,
      error: { code: "MFA_REQUIRED", message: "interactive auth required" },
      pipeline: PIPELINE,
    })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.outcome.kind).toBe("failed")
    if (read.outcome.kind !== "failed") return
    expect(read.outcome.errorCode).toBe("MFA_REQUIRED")
    expect(read.outcome.stage).toBe("login")
  })

  // A success with no meeting is the pipeline contradicting itself; recording
  // it as success would leave a booking permanently waiting for a link.
  test("status success without a join_url is a failure", () => {
    const read = readCallback({
      request_id: "room-booking-8f3a1c",
      status: "success",
      meeting: null,
      error: null,
    })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    if (read.outcome.kind !== "failed") throw new Error("expected failure")
    expect(read.outcome.errorCode).toBe("UNEXPECTED_RESPONSE")
  })

  test("an empty join_url doesn't count as a link", () => {
    const read = readCallback(success({ meeting: { join_url: "" } }))
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.outcome.kind).toBe("failed")
  })

  test("rejects a body with no request_id", () => {
    expect(readCallback({ status: "success" }).ok).toBe(false)
  })

  test("rejects a non-object body", () => {
    expect(readCallback("nope").ok).toBe(false)
    expect(readCallback([]).ok).toBe(false)
    expect(readCallback(null).ok).toBe(false)
  })

  test("rejects a header that disagrees with the body", () => {
    const read = readCallback(success(), "room-booking-other")
    expect(read.ok).toBe(false)
  })

  test("accepts a matching header", () => {
    expect(readCallback(success(), "room-booking-8f3a1c").ok).toBe(true)
  })

  test("tolerates a missing header", () => {
    expect(readCallback(success(), null).ok).toBe(true)
  })
})

describe("isRetryable", () => {
  test("only the transient API failure retries", () => {
    expect(isRetryable("CREATE_FAILED")).toBe(true)
    for (const code of [
      "INVALID_REQUEST",
      "LOGIN_FAILED",
      "MFA_REQUIRED",
      "INVALID_PAYLOAD",
      "OPTIONS_FAILED",
      "UNEXPECTED_RESPONSE",
      "UNKNOWN",
    ]) {
      expect(isRetryable(code)).toBe(false)
    }
  })
})
