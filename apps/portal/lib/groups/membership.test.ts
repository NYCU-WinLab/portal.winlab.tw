import { describe, expect, spyOn, test } from "bun:test"

import type { AuditInsert } from "@/lib/groups/audit"
import { GroupsCredentialError, type GroupsApi } from "@/lib/groups/google"
import {
  addToGroup,
  MAX_BATCH,
  parseUserId,
  readGroup,
  removeFromGroup,
  type MembershipDeps,
} from "@/lib/groups/membership"

type Reply = (
  method: string,
  path: string,
  body: string
) => Response | undefined

const DIR = "/admin/directory/v1"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

const notAuthorized = () =>
  json(
    {
      error: {
        code: 403,
        message: "Not Authorized to access this resource/api",
      },
    },
    403
  )

/** Group aaa is manageable, ggg is a gcp-* group; x@gmail.com is a member of aaa. */
const google: Reply = (method, path, body) => {
  if (method === "GET" && path === "/groups/aaa")
    return json({ id: "aaa", email: "lab-all@winlab.tw", name: "Lab" })
  if (method === "GET" && path === "/groups/ggg")
    return json({ id: "ggg", email: "gcp-billing@winlab.tw", name: "Billing" })
  if (method === "POST" && path === "/groups/aaa/members")
    return json({ email: (JSON.parse(body) as { email: string }).email })
  if (method === "GET" && path === "/groups/aaa/members")
    return json({
      members: [
        { id: "m1", email: "x@gmail.com", role: "MEMBER", type: "USER" },
      ],
    })
  if (method === "DELETE" && path === "/groups/aaa/members/m1")
    return new Response(null, { status: 204 })
  return undefined
}

function harness(
  opts: {
    manager?: boolean | Error
    reply?: Reply
    token?: () => Promise<string>
  } = {}
) {
  const calls: string[] = []
  const audits: AuditInsert[][] = []
  let managerChecks = 0
  const api: GroupsApi = {
    domain: "winlab.tw",
    token: opts.token ?? (async () => "t"),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? "GET"
      const path = url.pathname.slice(DIR.length)
      const body = typeof init?.body === "string" ? init.body : ""
      calls.push(`${method} ${path}`)
      return (
        opts.reply?.(method, path, body) ??
        google(method, path, body) ??
        new Response("unrouted", { status: 599 })
      )
    }) as typeof fetch,
  }
  const deps: MembershipDeps = {
    userId: "u1",
    api,
    isManager: async () => {
      managerChecks++
      if (opts.manager instanceof Error) throw opts.manager
      return opts.manager ?? true
    },
    audit: (rows) => {
      audits.push(rows)
    },
  }
  return { deps, calls, audits, managerChecks: () => managerChecks }
}

const addresses = (n: number) =>
  Array.from({ length: n }, (_, i) => `p${i}@gmail.com`)

describe("addToGroup", () => {
  test("adds each address and audits each one, in one hand-off", async () => {
    const h = harness({
      reply: (method, path, body) => {
        if (method !== "POST") return undefined
        if (body.includes("old@"))
          return json({ error: { message: "Member already exists." } }, 409)
        if (body.includes("first.last@"))
          return json({ email: "FirstLast@gmail.com" })
        return undefined
      },
    })
    const res = await addToGroup(h.deps, "aaa", [
      "New@Gmail.com",
      "old@gmail.com",
      "first.last@gmail.com",
    ])
    expect(res).toEqual({
      status: "ok",
      data: [
        { email: "new@gmail.com", outcome: "ok" },
        { email: "old@gmail.com", outcome: "already" },
        {
          email: "first.last@gmail.com",
          outcome: "ok",
          listedAs: "firstlast@gmail.com",
        },
      ],
    })
    expect(h.audits).toHaveLength(1)
    expect(h.audits[0]!.map((r) => [r.member_email, r.outcome])).toEqual([
      ["new@gmail.com", "ok"],
      ["old@gmail.com", "already"],
      ["first.last@gmail.com", "ok"],
    ])
  })

  test("a non-manager never reaches Google, and a full batch leaves one audit row", async () => {
    const h = harness({ manager: false })
    const res = await addToGroup(h.deps, "aaa", addresses(MAX_BATCH))
    expect(res).toMatchObject({ status: "forbidden", reason: "denied" })
    expect(h.calls).toEqual([])
    expect(h.audits).toHaveLength(1)
    expect(h.audits[0]).toHaveLength(1)
    expect(h.audits[0]![0]).toMatchObject({
      group_id: "aaa",
      group_email: "(unknown)",
      member_email: "p0@gmail.com",
      action: "add",
      outcome: "denied",
    })
    expect(h.audits[0]![0]!.detail).toContain(String(MAX_BATCH))
  })

  test("a gcp-* group is refused on Google's word, with one denied row", async () => {
    const h = harness()
    const res = await addToGroup(h.deps, "ggg", ["a@gmail.com", "b@gmail.com"])
    expect(res).toMatchObject({ status: "forbidden", reason: "not_managed" })
    expect(h.calls).toEqual(["GET /groups/ggg"])
    expect(h.audits).toEqual([
      [
        expect.objectContaining({
          group_email: "gcp-billing@winlab.tw",
          member_email: "a@gmail.com",
          outcome: "denied",
        }),
      ],
    ])
  })

  test("a 403 stops the batch; every address already sent is audited", async () => {
    const h = harness({
      reply: (method) => (method === "POST" ? notAuthorized() : undefined),
    })
    const res = await addToGroup(h.deps, "aaa", addresses(20))
    expect(res).toMatchObject({
      status: "forbidden",
      reason: "google_permission",
    })
    const posts = h.calls.filter((c) => c.startsWith("POST"))
    expect(posts.length).toBeGreaterThan(0)
    expect(posts.length).toBeLessThan(20)
    expect(h.audits).toHaveLength(1)
    expect(h.audits[0]!.map((r) => r.outcome)).toEqual(posts.map(() => "error"))
  })

  test("one address failing on its own doesn't stop the rest", async () => {
    const h = harness({
      reply: (method, path, body) =>
        method === "POST" && body.includes("bad@") ? json({}, 503) : undefined,
    })
    const res = await addToGroup(h.deps, "aaa", [
      "a@gmail.com",
      "bad@gmail.com",
      "c@gmail.com",
    ])
    expect(res.status).toBe("ok")
    if (res.status !== "ok") return
    expect(res.data.map((r) => r.outcome)).toEqual(["ok", "error", "ok"])
    expect(h.audits[0]).toHaveLength(3)
  })

  test("input the UI never sends is refused whole: no Google, no audit", async () => {
    const forged: [unknown, unknown][] = [
      ["aaa", ["a@gmail.com", {}]],
      ["aaa", ["a@gmail.com", "\u0000"]],
      ["aaa", ["a@gmail.com", "a\u0000b@gmail.com"]],
      ["aaa", ["a@gmail.com", "a\uD800b@gmail.com"]],
      ["aaa", ["a@gmail.com", "not-an-address"]],
      ["aaa", [`${"a".repeat(400)}@gmail.com`]],
      ["aaa", addresses(MAX_BATCH + 1)],
      ["aaa", "a@gmail.com"],
      ["aaa", []],
      [{}, ["a@gmail.com"]],
      ["groups/aaa", ["a@gmail.com"]],
    ]
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    for (const [groupId, emails] of forged) {
      const h = harness()
      const res = await addToGroup(h.deps, groupId, emails)
      expect(res.status).not.toBe("ok")
      expect(h.managerChecks()).toBe(0)
      expect(h.calls).toEqual([])
      expect(h.audits).toEqual([])
    }
    // Each one leaves a trace in the logs, but never what it carried.
    expect(warn).toHaveBeenCalledTimes(forged.length)
    for (const args of warn.mock.calls)
      expect(JSON.stringify(args)).not.toContain("gmail.com")
    warn.mockRestore()
  })

  test("authorisation failing part-way is audited once, as error", async () => {
    const cases = [
      harness({ manager: new Error("is_group_manager failed: timeout") }),
      harness({
        reply: (method, path) =>
          method === "GET" && path === "/groups/aaa"
            ? json({}, 503)
            : undefined,
      }),
      harness({
        reply: (method) => (method === "GET" ? notAuthorized() : undefined),
      }),
      harness({
        token: async () => {
          throw new GroupsCredentialError("無法取得 Google 權杖")
        },
      }),
    ]
    for (const h of cases) {
      const res = await addToGroup(h.deps, "aaa", [
        "a@gmail.com",
        "b@gmail.com",
      ])
      expect(res.status).not.toBe("ok")
      expect(h.calls.some((c) => c.startsWith("POST"))).toBe(false)
      expect(h.audits).toEqual([
        [
          expect.objectContaining({
            group_id: "aaa",
            group_email: "(unknown)",
            member_email: "a@gmail.com",
            outcome: "error",
          }),
        ],
      ])
    }
  })
})

describe("removeFromGroup", () => {
  test("deletes by member id and audits it", async () => {
    const h = harness()
    expect(await removeFromGroup(h.deps, "aaa", "X@gmail.com")).toEqual({
      status: "ok",
      data: { email: "x@gmail.com", outcome: "ok" },
    })
    expect(h.calls).toContain("DELETE /groups/aaa/members/m1")
    expect(h.audits).toEqual([
      [expect.objectContaining({ action: "remove", outcome: "ok" })],
    ])
  })

  test("a non-manager never reaches Google and leaves one denied row", async () => {
    const h = harness({ manager: false })
    const res = await removeFromGroup(h.deps, "aaa", "x@gmail.com")
    expect(res).toMatchObject({ status: "forbidden", reason: "denied" })
    expect(h.calls).toEqual([])
    expect(h.audits).toEqual([
      [expect.objectContaining({ outcome: "denied", action: "remove" })],
    ])
  })

  test("forged input is refused without Google or audit", async () => {
    const forged: [unknown, unknown][] = [
      ["aaa", {}],
      ["aaa", "\u0000"],
      [123, "x@gmail.com"],
    ]
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    for (const [groupId, email] of forged) {
      const h = harness()
      expect((await removeFromGroup(h.deps, groupId, email)).status).not.toBe(
        "ok"
      )
      expect(h.managerChecks()).toBe(0)
      expect(h.calls).toEqual([])
      expect(h.audits).toEqual([])
    }
    expect(warn).toHaveBeenCalledTimes(forged.length)
    for (const args of warn.mock.calls)
      expect(JSON.stringify(args)).not.toContain("gmail.com")
    warn.mockRestore()
  })

  test("a 403 is reported as a permission problem, and audited", async () => {
    const h = harness({
      reply: (method, path) =>
        path === "/groups/aaa/members" ? notAuthorized() : undefined,
    })
    const res = await removeFromGroup(h.deps, "aaa", "x@gmail.com")
    expect(res).toMatchObject({
      status: "forbidden",
      reason: "google_permission",
    })
    expect(h.audits).toEqual([[expect.objectContaining({ outcome: "error" })]])
  })
})

describe("readGroup", () => {
  test("a forged group id is refused without Google, and leaves a trace", async () => {
    const forged: unknown[] = [123, "a-b", "x".repeat(65)]
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    for (const groupId of forged) {
      const h = harness()
      expect(await readGroup(h.deps, groupId)).toMatchObject({
        status: "forbidden",
        reason: "not_managed",
      })
      expect(h.managerChecks()).toBe(0)
      expect(h.calls).toEqual([])
    }
    expect(warn).toHaveBeenCalledTimes(forged.length)
    for (const args of warn.mock.calls) {
      expect(args[1]).toMatchObject({ check: "group id" })
      expect(JSON.stringify(args)).not.toContain("a-b")
      expect(JSON.stringify(args)).not.toContain("xxxx")
    }
    warn.mockRestore()
  })

  test("a non-manager never reaches Google", async () => {
    const h = harness({ manager: false })
    expect(await readGroup(h.deps, "aaa")).toMatchObject({
      status: "forbidden",
      reason: "denied",
    })
    expect(h.calls).toEqual([])
  })

  test("a manager gets Google's group and members; reads write no audit", async () => {
    const h = harness()
    const res = await readGroup(h.deps, "aaa")
    expect(res.status).toBe("ok")
    if (res.status !== "ok") return
    expect(res.data.group.email).toBe("lab-all@winlab.tw")
    expect(res.data.members.map((m) => m.email)).toEqual(["x@gmail.com"])
    expect(h.audits).toEqual([])
  })

  test("a gcp-* group is not managed", async () => {
    const h = harness()
    expect(await readGroup(h.deps, "ggg")).toMatchObject({
      status: "forbidden",
      reason: "not_managed",
    })
  })
})

describe("parseUserId", () => {
  test("only a UUID string", () => {
    expect(parseUserId("9a9a9a9a-0000-0000-0000-000000000001")).toBe(
      "9a9a9a9a-0000-0000-0000-000000000001"
    )
    for (const bad of ["", "u1", {}, 1, null])
      expect(parseUserId(bad)).toBeNull()
  })
})
