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
  // Parent groups (the nesting fence): nobody is nested in anything.
  if (method === "GET" && path === "/groups") return json({})
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
  if (method === "GET" && path === "/groups/aaa/members/m1")
    return json({ id: "m1", email: "x@gmail.com", role: "MEMBER" })
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
      // Google refusing the service account is its own reason, not a bare error.
      if (h === cases[2])
        expect(res).toMatchObject({
          status: "forbidden",
          reason: "google_permission",
        })
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

describe("addToGroup deadlines", () => {
  test("a hung call is one error row; the rest still run and are audited", async () => {
    const h = harness()
    h.deps.api.timeoutMs = 20
    const origFetch = h.deps.api.fetch
    h.deps.api.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : ""
      if (body.includes("hang@"))
        return new Promise((_res, rej) =>
          init?.signal?.addEventListener("abort", () =>
            rej(new DOMException("aborted", "AbortError"))
          )
        )
      return origFetch(input, init)
    }) as typeof fetch
    const res = await addToGroup(h.deps, "aaa", [
      "hang@gmail.com",
      "ok@gmail.com",
    ])
    expect(res.status).toBe("ok")
    if (res.status !== "ok") return
    expect(res.data.map((r) => r.outcome)).toEqual(["error", "ok"])
    expect(res.data[0]!.detail).toContain("結果未知")
    expect(h.audits).toHaveLength(1)
    expect(h.audits[0]!.map((r) => r.outcome)).toEqual(["error", "ok"])
  })

  test("past the batch budget no new address starts; what ran is audited", async () => {
    const h = harness()
    let t = 0
    h.deps.api.now = () => t
    h.deps.batchBudgetMs = 100
    const origFetch = h.deps.api.fetch
    h.deps.api.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") t += 60
      return origFetch(input, init)
    }) as typeof fetch
    const res = await addToGroup(h.deps, "aaa", addresses(12))
    expect(res.status).toBe("error")
    if (res.status !== "error") return
    expect(res.detail).toContain("可能已套用")
    const sent = h.calls.filter((c) => c.startsWith("POST")).length
    expect(sent).toBeLessThan(12)
    expect(h.audits).toHaveLength(1)
    expect(h.audits[0]).toHaveLength(sent)
  })

  test("a throttled address does not stop the others", async () => {
    const h = harness({
      reply: (method, _p, body) =>
        method === "POST" && body.includes("slow@")
          ? json(
              {
                error: {
                  message: "limit",
                  errors: [{ reason: "rateLimitExceeded" }],
                },
              },
              403
            )
          : undefined,
    })
    h.deps.api.sleep = async () => {}
    const res = await addToGroup(h.deps, "aaa", [
      "slow@gmail.com",
      "ok@gmail.com",
    ])
    expect(res.status).toBe("ok")
    if (res.status !== "ok") return
    expect(res.data.map((r) => r.outcome)).toEqual(["error", "ok"])
  })
})

describe("removeFromGroup", () => {
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
        token: async () => {
          throw new GroupsCredentialError("無法取得 Google 權杖")
        },
      }),
    ]
    for (const h of cases) {
      const res = await removeFromGroup(h.deps, "aaa", "x@gmail.com")
      expect(res.status).not.toBe("ok")
      expect(h.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
      expect(h.audits).toEqual([
        [
          expect.objectContaining({
            group_id: "aaa",
            group_email: "(unknown)",
            member_email: "x@gmail.com",
            action: "remove",
            outcome: "error",
          }),
        ],
      ])
    }
  })

  test("a forged removal of an OWNER is protected, never deleted, audited once", async () => {
    const h = harness({
      reply: (method, path) => {
        if (method === "GET" && path === "/groups/aaa/members")
          return json({
            members: [
              {
                id: "o1",
                email: "owner@winlab.tw",
                role: "OWNER",
                type: "USER",
              },
            ],
          })
        return undefined
      },
    })
    const res = await removeFromGroup(h.deps, "aaa", "owner@winlab.tw")
    expect(res).toEqual({
      status: "ok",
      data: { email: "owner@winlab.tw", outcome: "protected" },
    })
    expect(h.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
    expect(h.audits).toEqual([
      [
        expect.objectContaining({
          action: "remove",
          outcome: "protected",
          member_email: "owner@winlab.tw",
        }),
      ],
    ])
  })

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

describe("the group id Google returns", () => {
  test("a different id than the one the manager check covered is refused, no write", async () => {
    const reply: Reply = (method, path) =>
      method === "GET" && path === "/groups/aaa"
        ? json({ id: "zzz", email: "lab-all@winlab.tw" })
        : undefined
    const add = harness({ reply })
    expect(await addToGroup(add.deps, "aaa", ["a@gmail.com"])).toMatchObject({
      status: "forbidden",
      reason: "not_managed",
    })
    expect(add.calls.some((c) => c.startsWith("POST"))).toBe(false)
    expect(add.audits[0]![0]).toMatchObject({
      outcome: "denied",
      detail: "not manageable",
    })
    const rm = harness({ reply })
    expect(await removeFromGroup(rm.deps, "aaa", "x@gmail.com")).toMatchObject({
      status: "forbidden",
      reason: "not_managed",
    })
    expect(rm.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
    expect((await readGroup(harness({ reply }).deps, "aaa")).status).toBe(
      "forbidden"
    )
  })
})

describe("the nesting fence", () => {
  const parents =
    (list: string[] | Response): Reply =>
    (method, path) =>
      method === "GET" && path === "/groups"
        ? list instanceof Response
          ? list
          : json({ groups: list.map((email) => ({ id: "p", email })) })
        : undefined

  test("a group nested in a gcp-* group is refused for add and remove: no write, one denied row", async () => {
    const add = harness({ reply: parents(["gcp-billing@winlab.tw"]) })
    expect(await addToGroup(add.deps, "aaa", ["a@gmail.com"])).toMatchObject({
      status: "forbidden",
      reason: "not_managed",
    })
    expect(add.calls.some((c) => c.startsWith("POST"))).toBe(false)
    expect(add.audits).toHaveLength(1)
    expect(add.audits[0]![0]).toMatchObject({
      outcome: "denied",
      group_email: "lab-all@winlab.tw",
    })
    expect(add.audits[0]![0]!.detail).toContain("nested in a gcp-* group")

    const rm = harness({ reply: parents(["gcp-billing@winlab.tw"]) })
    expect(await removeFromGroup(rm.deps, "aaa", "x@gmail.com")).toMatchObject({
      status: "forbidden",
      reason: "not_managed",
    })
    expect(rm.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
  })

  test("a clean ancestry writes; reads don't look at ancestors at all", async () => {
    const h = harness({ reply: parents(["staff@winlab.tw"]) })
    expect((await addToGroup(h.deps, "aaa", ["a@gmail.com"])).status).toBe("ok")
    const r = harness({ reply: parents(["gcp-billing@winlab.tw"]) })
    expect((await readGroup(r.deps, "aaa")).status).toBe("ok")
    expect(r.calls.some((c) => c.startsWith("GET /groups?"))).toBe(false)
  })

  test("a failing lookup fails closed: error, audited, no write", async () => {
    const h = harness({ reply: parents(json({}, 500)) })
    const res = await addToGroup(h.deps, "aaa", ["a@gmail.com"])
    expect(res.status).toBe("error")
    expect(h.calls.some((c) => c.startsWith("POST"))).toBe(false)
    expect(h.audits[0]![0]).toMatchObject({ outcome: "error" })
  })
})

describe("a 409 reports Google's spelling", () => {
  const conflict: Reply = (method, path, body) => {
    if (method === "POST") return json({ error: { message: "exists" } }, 409)
    if (method === "GET" && path === "/groups/aaa/members")
      return json({
        members: [
          { id: "1", email: "firstlast@gmail.com", role: "MEMBER" },
          { id: "2", email: "a.b@winlab.tw", role: "MEMBER" },
        ],
      })
    void body
    return undefined
  }

  test("a dotted Gmail resolves to the dotless address Google lists, with one list per batch", async () => {
    const h = harness({ reply: conflict })
    const res = await addToGroup(h.deps, "aaa", [
      "first.last@gmail.com",
      "First.Last@googlemail.com",
      "ab@winlab.tw",
    ])
    expect(res).toEqual({
      status: "ok",
      data: [
        {
          email: "first.last@gmail.com",
          outcome: "already",
          listedAs: "firstlast@gmail.com",
        },
        // Equivalent only within the Gmail hosts' own spelling rules.
        {
          email: "first.last@googlemail.com",
          outcome: "already",
          listedAs: "firstlast@gmail.com",
        },
        // Not Gmail: dots matter, so no match, and the asked spelling stays.
        { email: "ab@winlab.tw", outcome: "already" },
      ],
    })
    expect(h.calls.filter((c) => c === "GET /groups/aaa/members")).toHaveLength(
      1
    )
  })

  test("if the member list can't be read, the asked spelling stays", async () => {
    const h = harness({
      reply: (method, path) =>
        method === "POST"
          ? json({}, 409)
          : path === "/groups/aaa/members"
            ? json({}, 500)
            : undefined,
    })
    const err = spyOn(console, "error").mockImplementation(() => {})
    const res = await addToGroup(h.deps, "aaa", ["first.last@gmail.com"])
    err.mockRestore()
    expect(res).toEqual({
      status: "ok",
      data: [{ email: "first.last@gmail.com", outcome: "already" }],
    })
  })
})

describe("what the browser is told", () => {
  test("a per-address failure carries a short message; the audit keeps the detail", async () => {
    const h = harness({
      reply: (method) =>
        method === "POST"
          ? json(
              {
                error: {
                  message: "backend secret",
                  errors: [{ reason: "backendError" }],
                },
              },
              503
            )
          : undefined,
    })
    const res = await addToGroup(h.deps, "aaa", ["a@gmail.com"])
    expect(res).toEqual({
      status: "ok",
      data: [
        {
          email: "a@gmail.com",
          outcome: "error",
          detail: "Google 503（backendError）",
        },
      ],
    })
    expect(h.audits[0]![0]!.detail).toContain("backend secret")
  })
})
