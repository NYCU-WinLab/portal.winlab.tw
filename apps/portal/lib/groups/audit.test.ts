import { describe, expect, test } from "bun:test"

import { buildAuditRow } from "@/lib/groups/audit"

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
