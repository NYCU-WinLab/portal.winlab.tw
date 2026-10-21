import { describe, expect, spyOn, test } from "bun:test"

import type { AuditInsert } from "@/lib/groups/audit"
import { GroupsCredentialError, type GroupsApi } from "@/lib/groups/google"
import {
  addToGroup,
  MAX_BATCH,
  parseUserId,
  readGroup,
  removeFromGroup,
  ANCESTORS_UNVERIFIED,
  NESTED_MESSAGE,
  NOT_MANAGED,
  TOO_DEEP,
  type MembershipDeps,
} from "@/lib/groups/membership"

/** "hang" never answers; the call's own timeout has to end it. */
type Reply = (
  method: string,
  path: string,
  body: string
) => Response | "hang" | undefined

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
    /** Extra api fields: clock, sleep, timeouts. */
    api?: Partial<GroupsApi>
    budgetMs?: number
  } = {}
) {
  const calls: string[] = []
  const audits: AuditInsert[][] = []
  let managerChecks = 0
  const api: GroupsApi = {
    domain: "winlab.tw",
    token: opts.token ?? (async () => "t"),
    ...opts.api,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? "GET"
      const path = url.pathname.slice(DIR.length)
      const body = typeof init?.body === "string" ? init.body : ""
      calls.push(`${method} ${path}`)
      const reply =
        opts.reply?.(method, path, body) ??
        google(method, path, body) ??
        new Response("unrouted", { status: 599 })
      if (reply !== "hang") return reply
      return new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        )
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
    batchBudgetMs: opts.budgetMs,
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
    // A POST reached fetch, so the UI is told a write may have landed.
    expect(res.sent).toBe(true)
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
      // Google's answer was about another group: its address stays out.
      group_email: "(unknown)",
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
    const nested = await addToGroup(add.deps, "aaa", ["a@gmail.com"])
    expect(nested).toMatchObject({
      status: "forbidden",
      reason: "not_managed",
      detail: NESTED_MESSAGE,
    })
    // Not the "doesn't exist" text, and not the ancestor's name.
    expect(NESTED_MESSAGE).not.toBe(NOT_MANAGED)
    expect(JSON.stringify(nested)).not.toContain("gcp-billing")
    expect(add.calls.some((c) => c.startsWith("POST"))).toBe(false)
    expect(add.audits).toHaveLength(1)
    expect(add.audits[0]![0]).toMatchObject({
      outcome: "denied",
      group_email: "lab-all@winlab.tw",
    })
    // The ancestor's address stays out of the row managers can read.
    expect(add.audits[0]![0]!.detail).toBe(
      "nested in a group the portal may not manage"
    )
    expect(add.audits[0]![0]!.detail).not.toContain("gcp-billing")

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
    // The harness records paths without the query string: "GET /groups" is
    // the parent lookup (the group itself is "GET /groups/aaa").
    expect(r.calls).not.toContain("GET /groups")
    expect(h.calls).toContain("GET /groups")
  })

  test("a failing lookup fails closed: error, audited, no write", async () => {
    const h = harness({ reply: parents(json({}, 500)) })
    const err = spyOn(console, "error").mockImplementation(() => {})
    const res = await addToGroup(h.deps, "aaa", ["a@gmail.com"])
    err.mockRestore()
    expect(res).toEqual({
      status: "error",
      detail: ANCESTORS_UNVERIFIED,
      sent: false,
    })
    expect(h.calls.some((c) => c.startsWith("POST"))).toBe(false)
    // The group is known by then, so the row names it.
    expect(h.audits[0]![0]).toMatchObject({
      outcome: "error",
      group_email: "lab-all@winlab.tw",
      detail: ANCESTORS_UNVERIFIED,
    })
  })

  test("ancestry too deep to check is a refusal with its own reason, audited as denied", async () => {
    let n = 0
    const chain: Reply = (method, path) =>
      method === "GET" && path === "/groups"
        ? json({ groups: [{ id: "p", email: `g${n++}@winlab.tw` }] })
        : undefined
    for (const action of ["add", "remove"] as const) {
      n = 0
      const h = harness({ reply: chain })
      const res =
        action === "add"
          ? await addToGroup(h.deps, "aaa", ["a@gmail.com"])
          : await removeFromGroup(h.deps, "aaa", "x@gmail.com")
      expect(res).toEqual({
        status: "forbidden",
        reason: "not_managed",
        detail: TOO_DEEP,
        sent: false,
      })
      expect(h.audits[0]![0]).toMatchObject({
        outcome: "denied",
        detail: TOO_DEEP,
      })
      expect(h.calls.some((c) => /^(POST|DELETE)/.test(c))).toBe(false)
    }
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
  test("a per-address failure carries the same short message to the browser and the audit", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {})
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
    // The audit is readable by managers: same short text, no upstream words.
    expect(h.audits[0]![0]!.detail).toBe("Google 503（backendError）")
    expect(JSON.stringify(h.audits)).not.toContain("backend secret")
    expect(JSON.stringify(res)).not.toContain("backend secret")
    // The full text is in the log, with who and which group.
    expect(
      log.mock.calls.some((c) => JSON.stringify(c).includes("backend secret"))
    ).toBe(true)
    expect(
      log.mock.calls.some((c) => JSON.stringify(c).includes('"actor":"u1"'))
    ).toBe(true)
    log.mockRestore()
  })

  test("a failed request's audit row carries the client message, not the cause", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {})
    const h = harness({
      token: async () => {
        throw new GroupsCredentialError("沒有取得 token", "STS said: secret")
      },
    })
    const res = await addToGroup(h.deps, "aaa", ["a@gmail.com"])
    // The STS text survives only here, with who asked.
    const logged = JSON.stringify(log.mock.calls)
    expect(logged).toContain("STS said: secret")
    expect(logged).toContain('"actor":"u1"')
    log.mockRestore()
    expect(res).toEqual({
      status: "error",
      detail: "沒有取得 token",
      sent: false,
    })
    expect(h.audits[0]![0]!.detail).toBe("沒有取得 token")
    expect(JSON.stringify(h.audits)).not.toContain("secret")
  })

  test("a remove failure shows the browser a short message only", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {})
    const h = harness({
      reply: (method) =>
        method === "DELETE"
          ? json(
              {
                error: {
                  message: "remove secret",
                  errors: [{ reason: "backendError" }],
                },
              },
              503
            )
          : undefined,
    })
    const res = await removeFromGroup(h.deps, "aaa", "x@gmail.com")
    log.mockRestore()
    expect(res).toEqual({
      status: "ok",
      data: {
        email: "x@gmail.com",
        outcome: "error",
        detail: "Google 503（backendError）",
      },
    })
    expect(JSON.stringify(h.audits)).not.toContain("remove secret")
  })
})

describe("sent: did a write reach Google", () => {
  const quiet = () => spyOn(console, "error").mockImplementation(() => {})

  test("failures before any write say sent: false, whatever their text", async () => {
    const e = quiet()
    // Credential failure.
    const cred = harness({
      token: async () => {
        throw new GroupsCredentialError("no token")
      },
    })
    expect(await addToGroup(cred.deps, "aaa", ["a@gmail.com"])).toMatchObject({
      sent: false,
    })
    // is_group_manager failing.
    const mgr = harness({ manager: new Error("rpc down") })
    expect(await addToGroup(mgr.deps, "aaa", ["a@gmail.com"])).toMatchObject({
      sent: false,
    })
    expect(await removeFromGroup(mgr.deps, "aaa", "x@gmail.com")).toMatchObject(
      { sent: false }
    )
    // getGroup timing out.
    const slow = harness({
      api: { timeoutMs: 10 },
      reply: (method, path) =>
        method === "GET" && path === "/groups/aaa" ? "hang" : undefined,
    })
    const res = await addToGroup(slow.deps, "aaa", ["a@gmail.com"])
    expect(res).toMatchObject({ status: "error", sent: false })
    // A token that stalls.
    const stall = harness({
      api: { timeoutMs: 10 },
      token: () => new Promise<string>(() => {}),
    })
    expect(await addToGroup(stall.deps, "aaa", ["a@gmail.com"])).toMatchObject({
      sent: false,
    })
    // Malformed input and reads.
    expect(await addToGroup(cred.deps, "aaa", [])).toMatchObject({
      sent: false,
    })
    expect(await readGroup(cred.deps, "aaa")).toMatchObject({ sent: false })
    e.mockRestore()
  })

  test("a batch stopped by Google refusing the account after a POST says sent: true", async () => {
    const e = quiet()
    const h = harness({
      reply: (method) => (method === "POST" ? notAuthorized() : undefined),
    })
    const res = await addToGroup(h.deps, "aaa", ["a@gmail.com", "b@gmail.com"])
    e.mockRestore()
    expect(res).toMatchObject({
      status: "forbidden",
      reason: "google_permission",
      sent: true,
    })
  })

  test("a remove that fails on its DELETE says sent: true; on its read, false", async () => {
    const e = quiet()
    const del = harness({
      reply: (method) => (method === "DELETE" ? notAuthorized() : undefined),
    })
    expect(await removeFromGroup(del.deps, "aaa", "x@gmail.com")).toMatchObject(
      { status: "forbidden", sent: true }
    )
    const read = harness({
      reply: (method, path) =>
        method === "GET" && path === "/groups/aaa/members"
          ? notAuthorized()
          : undefined,
    })
    expect(
      await removeFromGroup(read.deps, "aaa", "x@gmail.com")
    ).toMatchObject({ status: "forbidden", sent: false })
    e.mockRestore()
  })
})

describe("one deadline for the whole action", () => {
  const throttled =
    (match: (method: string, path: string) => boolean): Reply =>
    (method, path) =>
      match(method, path)
        ? json(
            {
              error: {
                message: "slow",
                errors: [{ reason: "rateLimitExceeded" }],
              },
            },
            403
          )
        : undefined
  const clock = () => ({ now: () => 1000, sleep: async () => {} })

  test("a retry stops at the deadline for the batch's own writes", async () => {
    const e = spyOn(console, "error").mockImplementation(() => {})
    const h = harness({
      api: clock(),
      budgetMs: 1,
      reply: throttled((m) => m === "POST"),
    })
    await addToGroup(h.deps, "aaa", ["a@gmail.com"])
    e.mockRestore()
    expect(h.calls.filter((c) => c.startsWith("POST"))).toHaveLength(1)
  })

  test("authorisation is inside the same deadline", async () => {
    const e = spyOn(console, "error").mockImplementation(() => {})
    const h = harness({
      api: clock(),
      budgetMs: 1,
      reply: throttled((m, p) => m === "GET" && p === "/groups/aaa"),
    })
    await addToGroup(h.deps, "aaa", ["a@gmail.com"])
    e.mockRestore()
    expect(h.calls.filter((c) => c === "GET /groups/aaa")).toHaveLength(1)
  })

  test("the ancestor walk is inside it too", async () => {
    const e = spyOn(console, "error").mockImplementation(() => {})
    const h = harness({
      api: clock(),
      budgetMs: 1,
      reply: throttled((m, p) => m === "GET" && p === "/groups"),
    })
    await addToGroup(h.deps, "aaa", ["a@gmail.com"])
    e.mockRestore()
    expect(h.calls.filter((c) => c === "GET /groups")).toHaveLength(1)
  })

  test("remove respects it", async () => {
    const e = spyOn(console, "error").mockImplementation(() => {})
    const h = harness({
      api: clock(),
      budgetMs: 1,
      reply: throttled((m, p) => m === "GET" && p === "/groups/aaa/members"),
    })
    await removeFromGroup(h.deps, "aaa", "x@gmail.com")
    e.mockRestore()
    expect(h.calls.filter((c) => c === "GET /groups/aaa/members")).toHaveLength(
      1
    )
  })
})

describe("the deadline bounds the whole action", () => {
  const quiet = () => spyOn(console, "error").mockImplementation(() => {})
  /** A fake clock the harness's fetch advances by `step` on matching calls. */
  function timed(
    step: (method: string, path: string) => number,
    opts: Parameters<typeof harness>[0] = {}
  ) {
    let t = 0
    const h = harness({ ...opts, api: { ...opts.api, now: () => t } })
    const inner = h.deps.api.fetch
    h.deps.api.fetch = ((i: RequestInfo | URL, init?: RequestInit) => {
      t += step(
        init?.method ?? "GET",
        new URL(String(i)).pathname.slice(DIR.length)
      )
      return inner(i, init)
    }) as typeof fetch
    return h
  }

  test("remove whose deadline passes after the by-id read: no DELETE, error, sent: false", async () => {
    const e = quiet()
    const h = timed((m, p) => (p === "/groups/aaa/members/m1" ? 500 : 0), {
      budgetMs: 100,
    })
    const res = await removeFromGroup(h.deps, "aaa", "x@gmail.com")
    e.mockRestore()
    expect(res).toMatchObject({ status: "error", sent: false })
    expect(h.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
    expect(h.audits[0]![0]).toMatchObject({
      action: "remove",
      outcome: "error",
    })
  })

  test("a deadline that passes during the ancestor walk stops before any POST, and says nothing was sent", async () => {
    const e = quiet()
    const h = timed((m, p) => (m === "GET" && p === "/groups" ? 500 : 0), {
      budgetMs: 100,
    })
    const res = await addToGroup(h.deps, "aaa", ["a@gmail.com", "b@gmail.com"])
    e.mockRestore()
    expect(res.status).toBe("error")
    expect(h.calls.some((c) => c.startsWith("POST"))).toBe(false)
    if (res.status === "error") expect(res.sent).toBe(false)
  })

  test("a batch stopped by the deadline before any POST does not claim a write may have landed", async () => {
    const e = quiet()
    // The walk's reply (the last pre-write call) is the one that uses the
    // budget up, but is itself fine: pagination is not in play for an empty
    // parent list, so the next thing is the batch loop.
    let used = false
    const h = timed(
      (m, p) => {
        if (m === "GET" && p === "/groups" && !used) {
          used = true
          return 100
        }
        return 0
      },
      { budgetMs: 100 }
    )
    const res = await addToGroup(h.deps, "aaa", ["a@gmail.com"])
    e.mockRestore()
    expect(res.status).toBe("error")
    if (res.status !== "error") return
    // Either the walk or the loop stopped it; in both nothing was sent.
    expect(res.sent).toBe(false)
    expect(res.detail).not.toContain("可能已套用")
  })

  test("a long ancestor chain stops at the deadline: no call starts after it", async () => {
    const e = quiet()
    let n = 0
    const h = timed(() => 30, {
      budgetMs: 100,
      reply: (m, p) =>
        m === "GET" && p === "/groups"
          ? json({ groups: [{ id: "p", email: `g${n++}@winlab.tw` }] })
          : undefined,
    })
    const res = await removeFromGroup(h.deps, "aaa", "x@gmail.com")
    e.mockRestore()
    expect(res.status).toBe("error")
    // aaa (30) + at most the walk calls that began before 100.
    expect(h.calls.length).toBeLessThanOrEqual(4)
    expect(h.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
  })

  test("authorisation and the walk use the deadline for remove too", async () => {
    const e = quiet()
    const clock = { now: () => 1000, sleep: async () => {} }
    const throttled =
      (match: (m: string, p: string) => boolean): Reply =>
      (m, p) =>
        match(m, p)
          ? json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 403)
          : undefined
    const auth = harness({
      api: clock,
      budgetMs: 1,
      reply: throttled((m, p) => m === "GET" && p === "/groups/aaa"),
    })
    await removeFromGroup(auth.deps, "aaa", "x@gmail.com")
    expect(auth.calls.filter((c) => c === "GET /groups/aaa")).toHaveLength(1)
    const walk = harness({
      api: clock,
      budgetMs: 1,
      reply: throttled((m, p) => m === "GET" && p === "/groups"),
    })
    await removeFromGroup(walk.deps, "aaa", "x@gmail.com")
    expect(walk.calls.filter((c) => c === "GET /groups")).toHaveLength(1)
    e.mockRestore()
  })

  test("remove records the group's address when the walk fails, and cuts a hung call", async () => {
    const e = quiet()
    const failing = harness({
      reply: (m, p) =>
        m === "GET" && p === "/groups" ? json({}, 500) : undefined,
    })
    const res = await removeFromGroup(failing.deps, "aaa", "x@gmail.com")
    expect(res).toEqual({
      status: "error",
      detail: ANCESTORS_UNVERIFIED,
      sent: false,
    })
    expect(failing.audits[0]![0]).toMatchObject({
      outcome: "error",
      group_email: "lab-all@winlab.tw",
    })
    const hung = harness({
      reply: (m, p) =>
        m === "DELETE" && p === "/groups/aaa/members/m1" ? "hang" : undefined,
    })
    hung.deps.api.timeoutMs = 20
    const out = await removeFromGroup(hung.deps, "aaa", "x@gmail.com")
    e.mockRestore()
    expect(out).toMatchObject({
      status: "ok",
      data: { outcome: "error" },
    })
    if (out.status === "ok") expect(out.data.detail).toContain("結果未知")
  })

  test("a fatal 403 in the parent lookup is a permission failure, nothing sent", async () => {
    const e = quiet()
    const reply: Reply = (m, p) =>
      m === "GET" && p === "/groups" ? notAuthorized() : undefined
    const add = harness({ reply })
    expect(await addToGroup(add.deps, "aaa", ["a@gmail.com"])).toMatchObject({
      status: "forbidden",
      reason: "google_permission",
      sent: false,
    })
    const rm = harness({ reply })
    expect(await removeFromGroup(rm.deps, "aaa", "x@gmail.com")).toMatchObject({
      status: "forbidden",
      reason: "google_permission",
      sent: false,
    })
    e.mockRestore()
    expect(add.calls.some((c) => /^(POST|DELETE)/.test(c))).toBe(false)
    expect(rm.calls.some((c) => /^(POST|DELETE)/.test(c))).toBe(false)
  })

  test("per-address failure logs carry actor, group and the address", async () => {
    const e = quiet()
    const add = harness({
      reply: (m) => (m === "POST" ? json({}, 503) : undefined),
    })
    await addToGroup(add.deps, "aaa", ["a@gmail.com"])
    const rm = harness({
      reply: (m) => (m === "DELETE" ? json({}, 503) : undefined),
    })
    await removeFromGroup(rm.deps, "aaa", "x@gmail.com")
    const lines = JSON.stringify(e.mock.calls)
    e.mockRestore()
    expect(lines).toContain('"address":"a@gmail.com"')
    expect(lines).toContain('"address":"x@gmail.com"')
    expect(lines).toContain('"actor":"u1"')
    expect(lines).toContain('"group":"aaa"')
  })

  test("the deadline log carries actor, group and counts", async () => {
    const e = quiet()
    let t = 0
    const h = harness({ api: { now: () => t }, budgetMs: 100 })
    const inner = h.deps.api.fetch
    h.deps.api.fetch = ((i: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") t += 60
      return inner(i, init)
    }) as typeof fetch
    await addToGroup(h.deps, "aaa", addresses(12))
    const logged = JSON.stringify(e.mock.calls)
    e.mockRestore()
    expect(logged).toContain("stopped at the deadline")
    expect(logged).toContain('"actor":"u1"')
    expect(logged).toContain('"group":"aaa"')
    expect(logged).toContain('"total":12')
  })
})
