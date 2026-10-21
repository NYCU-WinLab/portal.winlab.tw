import { describe, expect, spyOn, test } from "bun:test"

import {
  buildAuditRow,
  recordMembershipChanges,
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

describe("recordMembershipChanges", () => {
  const mk = (outcome: AuditInsert["outcome"], n = 0): AuditInsert => ({
    actor_id: "u1",
    group_id: "aaa",
    group_email: "a@winlab.tw",
    member_email: `m${n}@gmail.com`,
    action: "add",
    outcome,
    detail: null,
  })

  /** A stand-in for the service-role client: the denied count, then the insert. */
  function fakeAdmin(opts: {
    count?: number | null
    countError?: unknown
    insertError?: unknown
  }) {
    const inserted: AuditInsert[][] = []
    const chain: Record<string, unknown> = {}
    for (const k of ["select", "eq", "gte"]) chain[k] = () => chain
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({ count: opts.count ?? 0, error: opts.countError ?? null })
    const admin = {
      from: () => ({
        select: () => chain,
        insert: async (rows: AuditInsert[]) => {
          inserted.push(rows)
          return { error: opts.insertError ?? null }
        },
      }),
    }
    return { make: (() => admin) as never, inserted }
  }

  const quiet = () => {
    const err = spyOn(console, "error").mockImplementation(() => {})
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    return { err, warn, done: () => (err.mockRestore(), warn.mockRestore()) }
  }

  test("inserts the rows", async () => {
    const f = fakeAdmin({})
    const rows = [mk("ok"), mk("error", 1)]
    await recordMembershipChanges(rows, f.make)
    expect(f.inserted).toEqual([rows])
  })

  test("an insert error is logged with the rows and never thrown", async () => {
    const f = fakeAdmin({ insertError: { message: "boom" } })
    const q = quiet()
    const rows = [mk("ok")]
    await recordMembershipChanges(rows, f.make)
    expect(q.err).toHaveBeenCalledTimes(1)
    expect(q.err.mock.calls[0]).toContain(rows)
    q.done()
  })

  test("a failing denied count keeps every row", async () => {
    const f = fakeAdmin({ count: 999, countError: { message: "x" } })
    const q = quiet()
    const rows = [mk("denied"), mk("denied", 1), mk("ok", 2)]
    await recordMembershipChanges(rows, f.make)
    expect(f.inserted).toEqual([rows])
    q.done()
  })

  test("at the cap denied rows are dropped and ok / error rows kept", async () => {
    const f = fakeAdmin({ count: 30 })
    const q = quiet()
    await recordMembershipChanges(
      [mk("denied"), mk("ok", 1), mk("error", 2)],
      f.make
    )
    expect(f.inserted[0]!.map((r) => r.outcome)).toEqual(["ok", "error"])
    q.done()
  })

  test("nothing left to insert means no insert", async () => {
    const f = fakeAdmin({ count: 30 })
    const q = quiet()
    await recordMembershipChanges([mk("denied")], f.make)
    expect(f.inserted).toEqual([])
    q.done()
  })

  test("a throwing client is swallowed", async () => {
    const q = quiet()
    await recordMembershipChanges([mk("ok")], (() => {
      throw new Error("no env")
    }) as never)
    expect(q.err).toHaveBeenCalled()
    q.done()
  })
})
