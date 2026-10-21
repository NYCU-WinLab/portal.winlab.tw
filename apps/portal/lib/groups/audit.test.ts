import { describe, expect, test } from "bun:test"

import {
  buildAuditRow,
  splitDenied,
  type AuditInsert,
} from "@/lib/groups/audit"

describe("buildAuditRow", () => {
  test("maps a change result to a row keyed by the group id", () => {
    expect(
      buildAuditRow("u1", { id: "aaa", email: "a@winlab.tw" }, "add", {
        email: "x@gmail.com",
        outcome: "error",
        detail: "Google 503",
      })
    ).toEqual({
      actor_id: "u1",
      group_id: "aaa",
      group_email: "a@winlab.tw",
      member_email: "x@gmail.com",
      action: "add",
      outcome: "error",
      detail: "Google 503",
    })
  })

  test("truncates detail to the column's 500 characters", () => {
    const row = buildAuditRow(
      "u1",
      { id: "aaa", email: "a@winlab.tw" },
      "remove",
      { email: "x@gmail.com", outcome: "error", detail: "e".repeat(900) }
    )
    expect(row.detail!.length).toBe(500)
  })

  test("never hands Postgres a control character", () => {
    const row = buildAuditRow(
      "u1",
      { id: "aaa", email: "a@winlab.tw" },
      "add",
      {
        email: "x\u0000\uD800@gmail.com",
        outcome: "error",
        detail: "line\u0000\nnext",
      }
    )
    expect(row.member_email).toBe("x@gmail.com")
    expect(row.detail).toBe("line next")
  })

  test("clips member_email to the column's 320 characters, by code point", () => {
    const row = buildAuditRow(
      "u1",
      { id: "aaa", email: "a@winlab.tw" },
      "add",
      { email: "😀".repeat(400), outcome: "error" }
    )
    expect(Array.from(row.member_email)).toHaveLength(320)
    expect(row.member_email).toBe("😀".repeat(320))
  })

  test("notes the spelling Google listed an added address under", () => {
    expect(
      buildAuditRow("u1", { id: "aaa", email: "a@winlab.tw" }, "add", {
        email: "first.last@gmail.com",
        outcome: "ok",
        listedAs: "firstlast@gmail.com",
      }).detail
    ).toBe("listed by Google as firstlast@gmail.com")
  })
})

describe("splitDenied", () => {
  const row = (outcome: AuditInsert["outcome"], n = 0): AuditInsert => ({
    actor_id: "u1",
    group_id: "aaa",
    group_email: "a@winlab.tw",
    member_email: `m${n}@gmail.com`,
    action: "add",
    outcome,
    detail: null,
  })

  test("under the cap everything is kept", () => {
    const rows = [row("denied"), row("ok")]
    expect(splitDenied(rows, 0, 30)).toEqual({ keep: rows, dropped: [] })
  })

  test("at the cap denied rows are dropped, ok and error rows never", () => {
    const rows = [row("denied"), row("ok", 1), row("error", 2)]
    const { keep, dropped } = splitDenied(rows, 30, 30)
    expect(keep.map((r) => r.outcome)).toEqual(["ok", "error"])
    expect(dropped.map((r) => r.outcome)).toEqual(["denied"])
  })

  test("a request straddling the cap keeps only the room that is left", () => {
    const rows = [row("denied", 1), row("denied", 2), row("denied", 3)]
    const { keep, dropped } = splitDenied(rows, 28, 30)
    expect(keep).toHaveLength(2)
    expect(dropped).toHaveLength(1)
  })
})
