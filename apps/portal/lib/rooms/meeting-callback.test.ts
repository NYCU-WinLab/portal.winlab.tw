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
    expect(read.outcome.kind).toBe("created")
    if (read.outcome.kind !== "created") return
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
    expect(read.outcome.kind).toBe("created")
    if (read.outcome.kind !== "created") return
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
    if (read.outcome.kind !== "created") throw new Error("expected created")
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

describe("readCallback — cancellations", () => {
  // The one that would have broken everything: a successful cancellation
  // reports no meeting and no join_url. Read with the creation rule, every
  // working cancellation would be recorded as a failure and mailed about.
  test("a cancellation with no meeting is a success", () => {
    const read = readCallback({
      request_id: "room-booking-8f3a1c",
      action: "cancel",
      status: "success",
      stage: "done",
      meeting: null,
      api: { cancel_status: 204 },
      error: null,
      pipeline: PIPELINE,
    })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.action).toBe("cancel")
    expect(read.outcome.kind).toBe("cancelled")
  })

  test("a failed cancellation carries its code and action", () => {
    const read = readCallback({
      request_id: "room-booking-8f3a1c",
      action: "cancel",
      status: "failed",
      stage: "cancel",
      meeting: null,
      error: { code: "CANCEL_FAILED", message: "404 from Teams" },
      pipeline: PIPELINE,
    })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    if (read.outcome.kind !== "failed") throw new Error("expected failure")
    expect(read.outcome.errorCode).toBe("CANCEL_FAILED")
    expect(read.outcome.action).toBe("cancel")
  })

  // status success with an error code set is contradictory; treat it as the
  // failure it names rather than reporting a cancellation that may not have
  // happened.
  test("a cancellation reporting success alongside an error is a failure", () => {
    const read = readCallback({
      request_id: "room-booking-8f3a1c",
      action: "cancel",
      status: "success",
      error: { code: "CANCEL_FAILED", message: "already cancelled" },
    })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.outcome.kind).toBe("failed")
  })

  test("a missing action means create, matching the trigger's default", () => {
    const read = readCallback(success())
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.action).toBe("create")
  })

  test("a creation reports the ids the cancel pipeline will need", () => {
    const read = readCallback(
      success({
        meeting: {
          join_url: JOIN_URL,
          cancel_id: "040000008200e00074c5b7101a82e008",
          message_id: "1785492325352",
          event_id: "AAMkAGxxxx",
        },
      })
    )
    expect(read.ok).toBe(true)
    if (!read.ok) return
    if (read.outcome.kind !== "created") throw new Error("expected created")
    expect(read.outcome.cancelId).toBe("040000008200e00074c5b7101a82e008")
    expect(read.outcome.messageId).toBe("1785492325352")
    // Kept separately: the spec is explicit that the AAMkAG… id is NOT what
    // goes into EVENT_ID when cancelling.
    expect(read.outcome.eventId).toBe("AAMkAGxxxx")
  })
})

describe("isRetryable", () => {
  test("only the transient API failures retry", () => {
    expect(isRetryable("CREATE_FAILED")).toBe(true)
    expect(isRetryable("CANCEL_FAILED")).toBe(true)
    for (const code of [
      "INVALID_REQUEST",
      "LOGIN_FAILED",
      "MFA_REQUIRED",
      "INVALID_PAYLOAD",
      "OPTIONS_FAILED",
      "UNEXPECTED_RESPONSE",
      "NO_CALLBACK",
      "UNKNOWN",
    ]) {
      expect(isRetryable(code)).toBe(false)
    }
  })
})
