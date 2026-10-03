import { describe, expect, test } from "bun:test"

import { decideCancelTarget, type CreateRequestRow } from "./cancel-target"

const WARNING = "Teams 會議尚未建立完成或沒有回報會議識別碼"

function row(
  request_id: string,
  status: string,
  ids: { cancel_id?: string; message_id?: string } = {}
): CreateRequestRow {
  return {
    request_id,
    status,
    cancel_id: ids.cancel_id ?? null,
    message_id: ids.message_id ?? null,
  }
}

describe("decideCancelTarget", () => {
  test("no pipeline means nothing was ever asked for", () => {
    expect(
      decideCancelTarget({
        pipelineConfigured: false,
        requests: [row("r1", "succeeded", { cancel_id: "c", message_id: "m" })],
      })
    ).toEqual({ kind: "none" })
  })

  test("no create request at all stays quiet", () => {
    expect(
      decideCancelTarget({ pipelineConfigured: true, requests: [] })
    ).toEqual({ kind: "none" })
  })

  test("the newest row with both ids wins", () => {
    expect(
      decideCancelTarget({
        pipelineConfigured: true,
        requests: [
          row("r3", "pending"),
          row("r2", "succeeded", { cancel_id: "c2", message_id: "m2" }),
          row("r1", "succeeded", { cancel_id: "c1", message_id: "m1" }),
        ],
      })
    ).toEqual({
      kind: "cancel",
      requestId: "r2",
      cancelId: "c2",
      messageId: "m2",
    })
  })

  test("a row with only one of the ids is skipped", () => {
    expect(
      decideCancelTarget({
        pipelineConfigured: true,
        requests: [
          row("r2", "succeeded", { cancel_id: "c2" }),
          row("r1", "succeeded", { cancel_id: "c1", message_id: "m1" }),
        ],
      })
    ).toEqual({
      kind: "cancel",
      requestId: "r1",
      cancelId: "c1",
      messageId: "m1",
    })
  })

  test("a pending request warns: the meeting may still appear", () => {
    expect(
      decideCancelTarget({
        pipelineConfigured: true,
        requests: [row("r1", "pending")],
      })
    ).toEqual({ kind: "warn", message: WARNING })
  })

  test("success without ids warns: a meeting exists that can't be named", () => {
    expect(
      decideCancelTarget({
        pipelineConfigured: true,
        requests: [row("r1", "succeeded", { message_id: "m1" })],
      })
    ).toEqual({ kind: "warn", message: WARNING })
  })

  test("only failed requests mean no meeting to take down", () => {
    expect(
      decideCancelTarget({
        pipelineConfigured: true,
        requests: [row("r2", "failed"), row("r1", "failed")],
      })
    ).toEqual({ kind: "none" })
  })

  test("a failed retry after a pending one still warns", () => {
    expect(
      decideCancelTarget({
        pipelineConfigured: true,
        requests: [row("r2", "failed"), row("r1", "pending")],
      })
    ).toEqual({ kind: "warn", message: WARNING })
  })
})
