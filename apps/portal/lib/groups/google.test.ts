import { describe, expect, test } from "bun:test"

import {
  addMember,
  getGroup,
  GoogleGroupsError,
  GoogleTimeoutError,
  listDomainGroups,
  listMembers,
  listParentGroups,
  removeMember,
  isRateLimited,
  type GroupsApi,
} from "@/lib/groups/google"
import { failure, isFatal, RATE_LIMIT_MESSAGE } from "@/lib/groups/failure"

type Route = (url: URL, init?: RequestInit) => Response | undefined

const DIR = "/admin/directory/v1"

function fakeApi(routes: Route[]): GroupsApi & { calls: string[] } {
  const calls: string[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`)
    for (const r of routes) {
      const res = r(url, init)
      if (res) return res
    }
    return new Response("unrouted", { status: 599 })
  }) as typeof fetch
  return { fetch: fetchFn, token: async () => "t", domain: "winlab.tw", calls }
}

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

const isGet = (init?: RequestInit) => (init?.method ?? "GET") === "GET"

/** Two pages of members of group "aaa", the second one reached by pageToken. */
const membersOfAaa: Route = (u, init) => {
  if (u.pathname !== `${DIR}/groups/aaa/members` || !isGet(init))
    return undefined
  return u.searchParams.get("pageToken") === "p2"
    ? json({
        members: [
          {
            id: "200",
            email: "Owner@winlab.tw",
            role: "OWNER",
            type: "USER",
            status: "ACTIVE",
          },
          { id: "201", email: "Mgr@winlab.tw", role: "MANAGER", type: "USER" },
          { id: "202", email: "Late@Gmail.com", role: "MEMBER", type: "USER" },
        ],
      })
    : json({
        members: [
          { id: "100", email: "X@Gmail.com", role: "MEMBER", type: "USER" },
          { id: "101", role: "MEMBER", type: "CUSTOMER" },
        ],
        nextPageToken: "p2",
      })
}

describe("listDomainGroups", () => {
  test("asks by domain, follows nextPageToken, lower-cases addresses", async () => {
    const api = fakeApi([
      (u) =>
        u.pathname === `${DIR}/groups` && !u.searchParams.get("pageToken")
          ? json({
              groups: [
                { id: "aaa", email: "Lab-All@winlab.tw", name: "全實驗室" },
              ],
              nextPageToken: "p2",
            })
          : undefined,
      (u) =>
        u.pathname === `${DIR}/groups` &&
        u.searchParams.get("pageToken") === "p2"
          ? json({
              groups: [{ id: "bbb", email: "office@winlab.tw", name: "" }],
            })
          : undefined,
    ])
    expect(await listDomainGroups(api)).toEqual([
      { id: "aaa", email: "lab-all@winlab.tw", name: "全實驗室" },
      { id: "bbb", email: "office@winlab.tw", name: "office@winlab.tw" },
    ])
    const first = new URL(`https://x${api.calls[0]!.slice("GET ".length)}`)
    expect(first.searchParams.get("domain")).toBe("winlab.tw")
    expect(first.searchParams.get("maxResults")).toBe("200")
    expect(first.searchParams.has("customer")).toBe(false)
  })

  test("a 403 surfaces as GoogleGroupsError, not an empty list", async () => {
    const api = fakeApi([notAuthorized])
    const err = await listDomainGroups(api).catch((e) => e)
    expect(err).toBeInstanceOf(GoogleGroupsError)
    expect((err as GoogleGroupsError).status).toBe(403)
    expect((err as GoogleGroupsError).detail).toBe(
      "Not Authorized to access this resource/api"
    )
  })
})

describe("getGroup", () => {
  test("returns the group Google knows by that id", async () => {
    const api = fakeApi([
      (u) =>
        u.pathname === `${DIR}/groups/aaa`
          ? json({ id: "aaa", email: "GCP-Billing@winlab.tw", name: "Billing" })
          : undefined,
    ])
    expect(await getGroup(api, "aaa")).toEqual({
      id: "aaa",
      email: "gcp-billing@winlab.tw",
      name: "Billing",
    })
  })

  test("404 means no such group", async () => {
    const api = fakeApi([() => json({ error: { code: 404 } }, 404)])
    expect(await getGroup(api, "zzz")).toBeNull()
  })

  test("400 also means no such group (an id Google cannot parse)", async () => {
    const api = fakeApi([() => json({ error: { code: 400 } }, 400)])
    expect(await getGroup(api, "00000000000000a")).toBeNull()
  })

  test("other failures throw", async () => {
    const api = fakeApi([() => json({}, 503)])
    await expect(getGroup(api, "aaa")).rejects.toBeInstanceOf(GoogleGroupsError)
  })
})

describe("listMembers", () => {
  test("follows nextPageToken and keeps every field, lower-cased", async () => {
    const api = fakeApi([membersOfAaa])
    expect(await listMembers(api, "aaa")).toEqual([
      {
        id: "100",
        email: "x@gmail.com",
        role: "MEMBER",
        type: "USER",
        status: null,
      },
      {
        id: "101",
        email: null,
        role: "MEMBER",
        type: "CUSTOMER",
        status: null,
      },
      {
        id: "200",
        email: "owner@winlab.tw",
        role: "OWNER",
        type: "USER",
        status: "ACTIVE",
      },
      {
        id: "201",
        email: "mgr@winlab.tw",
        role: "MANAGER",
        type: "USER",
        status: null,
      },
      {
        id: "202",
        email: "late@gmail.com",
        role: "MEMBER",
        type: "USER",
        status: null,
      },
    ])
    expect(api.calls.every((c) => c.includes("maxResults=200"))).toBe(true)
  })

  test("a 403 surfaces as GoogleGroupsError", async () => {
    const api = fakeApi([notAuthorized])
    const err = await listMembers(api, "aaa").catch((e) => e)
    expect(err).toBeInstanceOf(GoogleGroupsError)
    expect((err as GoogleGroupsError).status).toBe(403)
  })
})

describe("addMember", () => {
  test("inserts a MEMBER, and a reply without an id is still ok", async () => {
    let body: unknown
    const api = fakeApi([
      (u, init) => {
        if (
          init?.method !== "POST" ||
          u.pathname !== `${DIR}/groups/aaa/members`
        )
          return undefined
        body = JSON.parse(String(init.body))
        return json({
          kind: "admin#directory#member",
          email: "me@timkuo.dev",
          role: "MEMBER",
        })
      },
    ])
    expect(await addMember(api, "aaa", "me@timkuo.dev")).toEqual({
      outcome: "ok",
      email: "me@timkuo.dev",
    })
    expect(body).toEqual({ email: "me@timkuo.dev", role: "MEMBER" })
  })

  test("reports the address the way Google lists it", async () => {
    const api = fakeApi([
      (u, init) =>
        init?.method === "POST"
          ? json({ email: "FirstLast@gmail.com", role: "MEMBER" })
          : undefined,
    ])
    expect(await addMember(api, "aaa", "first.last@gmail.com")).toEqual({
      outcome: "ok",
      email: "firstlast@gmail.com",
    })
  })

  test("a reply without a body keeps the address asked for", async () => {
    const api = fakeApi([
      (u, init) =>
        init?.method === "POST"
          ? new Response(null, { status: 200 })
          : undefined,
    ])
    expect(await addMember(api, "aaa", "x@gmail.com")).toEqual({
      outcome: "ok",
      email: "x@gmail.com",
    })
  })

  test("409 means already a member", async () => {
    const api = fakeApi([
      () =>
        json({ error: { code: 409, message: "Member already exists." } }, 409),
    ])
    expect(await addMember(api, "aaa", "x@gmail.com")).toEqual({
      outcome: "already",
      email: "x@gmail.com",
    })
  })

  test("403 and 5xx throw with their status", async () => {
    for (const [route, status] of [
      [notAuthorized, 403],
      [() => json({}, 503), 503],
    ] as const) {
      const err = await addMember(fakeApi([route]), "aaa", "x@gmail.com").catch(
        (e) => e
      )
      expect(err).toBeInstanceOf(GoogleGroupsError)
      expect((err as GoogleGroupsError).status).toBe(status)
    }
  })
})

describe("removeMember", () => {
  const deleted: Route = (u, init) =>
    init?.method === "DELETE" ? new Response(null, { status: 204 }) : undefined
  // The by-id re-read made right before DELETE; roles as the lists above say.
  const roles: Record<string, string> = {
    "100": "MEMBER",
    "200": "OWNER",
    "201": "MANAGER",
    "202": "MEMBER",
  }
  const byId: Route = (u, init) => {
    const m = u.pathname.match(/\/groups\/aaa\/members\/(\w+)$/)
    if (!m || !isGet(init)) return undefined
    return json({ id: m[1], role: roles[m[1]!] })
  }

  test("finds the member on any page and deletes by member id", async () => {
    const api = fakeApi([membersOfAaa, byId, deleted])
    expect(await removeMember(api, "aaa", " LATE@gmail.com ")).toBe("ok")
    expect(api.calls.filter((c) => c.startsWith("DELETE"))).toEqual([
      `DELETE ${DIR}/groups/aaa/members/202`,
    ])
  })

  test("never addresses a single member by email", async () => {
    const api = fakeApi([membersOfAaa, byId, deleted])
    await removeMember(api, "aaa", "x@gmail.com")
    expect(api.calls.some((c) => c.includes("@") || c.includes("%40"))).toBe(
      false
    )
    expect(api.calls.some((c) => c.includes("hasMember"))).toBe(false)
  })

  test("refuses an OWNER or MANAGER and never sends DELETE", async () => {
    for (const email of ["owner@winlab.tw", "MGR@winlab.tw"]) {
      const api = fakeApi([membersOfAaa, byId, deleted])
      expect(await removeMember(api, "aaa", email)).toBe("protected")
      expect(api.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
    }
  })

  test("someone not in the list is not_found, without a DELETE", async () => {
    const api = fakeApi([membersOfAaa, byId, deleted])
    expect(await removeMember(api, "aaa", "nobody@gmail.com")).toBe("not_found")
    expect(api.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
  })

  test("a DELETE that finds nothing is not_found", async () => {
    const api = fakeApi([
      membersOfAaa,
      byId,
      (u, init) =>
        init?.method === "DELETE"
          ? json(
              {
                error: { code: 404, message: "Resource Not Found: memberKey" },
              },
              404
            )
          : undefined,
    ])
    expect(await removeMember(api, "aaa", "x@gmail.com")).toBe("not_found")
  })

  test("a listed member without an id cannot be removed and says why", async () => {
    const api = fakeApi([
      (u) =>
        u.pathname === `${DIR}/groups/aaa/members`
          ? json({ members: [{ email: "noid@gmail.com", role: "MEMBER" }] })
          : undefined,
      deleted,
    ])
    await expect(removeMember(api, "aaa", "noid@gmail.com")).rejects.toThrow(
      /id/
    )
    expect(api.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
  })

  test("a 403 on DELETE throws", async () => {
    const api = fakeApi([
      membersOfAaa,
      byId,
      (u, init) => (init?.method === "DELETE" ? notAuthorized() : undefined),
    ])
    const err = await removeMember(api, "aaa", "x@gmail.com").catch((e) => e)
    expect(err).toBeInstanceOf(GoogleGroupsError)
    expect((err as GoogleGroupsError).status).toBe(403)
  })

  test("a promotion after the list is caught by the by-id re-read", async () => {
    const api = fakeApi([
      membersOfAaa,
      (u, init) =>
        isGet(init) && u.pathname.endsWith("/members/100")
          ? json({ id: "100", role: "OWNER" })
          : undefined,
      deleted,
    ])
    expect(await removeMember(api, "aaa", "x@gmail.com")).toBe("protected")
    expect(api.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
  })

  test("the member vanishing before the re-read is not_found", async () => {
    const api = fakeApi([
      membersOfAaa,
      (u, init) =>
        isGet(init) && u.pathname.endsWith("/members/100")
          ? json({ error: { message: "Resource Not Found" } }, 404)
          : undefined,
      deleted,
    ])
    expect(await removeMember(api, "aaa", "x@gmail.com")).toBe("not_found")
    expect(api.calls.some((c) => c.startsWith("DELETE"))).toBe(false)
  })
})

const rateLimited = (reason = "rateLimitExceeded") =>
  json(
    {
      error: {
        code: 403,
        message: "Rate Limit Exceeded",
        errors: [{ reason }],
      },
    },
    403
  )

describe("throttling and deadlines", () => {
  const withClock = (api: GroupsApi & { calls: string[] }) => {
    const sleeps: number[] = []
    return Object.assign(api, {
      sleeps,
      sleep: async (ms: number) => {
        sleeps.push(ms)
      },
    })
  }

  test("a rate-limit 403 is retried with backoff and then succeeds", async () => {
    let n = 0
    const api = withClock(
      fakeApi([
        (u, init) => {
          if (init?.method !== "POST") return undefined
          return ++n < 3 ? rateLimited("userRateLimitExceeded") : json({})
        },
      ])
    )
    expect(await addMember(api, "aaa", "x@gmail.com")).toEqual({
      outcome: "ok",
      email: "x@gmail.com",
    })
    expect(api.calls).toHaveLength(3)
    expect(api.sleeps).toHaveLength(2)
    expect(api.sleeps[1]!).toBeGreaterThan(api.sleeps[0]!)
  })

  test("still limited after the attempts is a non-permission error", async () => {
    const api = withClock(fakeApi([() => rateLimited("quotaExceeded")]))
    const err = await addMember(api, "aaa", "x@gmail.com").catch((e) => e)
    expect(err).toBeInstanceOf(GoogleGroupsError)
    expect(isRateLimited(err)).toBe(true)
    expect(isFatal(err)).toBe(false)
    expect(failure(err)).toEqual({
      status: "error",
      detail: RATE_LIMIT_MESSAGE,
    })
    expect(api.calls).toHaveLength(3)
  })

  test("no retry is started past the batch deadline", async () => {
    const api = withClock(fakeApi([() => rateLimited()]))
    api.now = () => 1000
    api.deadline = 1001
    const err = await addMember(api, "aaa", "x@gmail.com").catch((e) => e)
    expect(isRateLimited(err)).toBe(true)
    expect(api.calls).toHaveLength(1)
  })

  test("a plain 403 is not retried and stays a permission failure", async () => {
    const api = withClock(fakeApi([notAuthorized]))
    const err = await addMember(api, "aaa", "x@gmail.com").catch((e) => e)
    expect(api.calls).toHaveLength(1)
    expect(isFatal(err)).toBe(true)
    expect(failure(err)).toMatchObject({
      status: "forbidden",
      reason: "google_permission",
    })
  })

  test("a call that never answers is abandoned, result unknown", async () => {
    const api = fakeApi([])
    api.timeoutMs = 20
    api.fetch = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        )
      })) as typeof fetch
    const err = await addMember(api, "aaa", "x@gmail.com").catch((e) => e)
    expect(err).toBeInstanceOf(GoogleTimeoutError)
    expect(isFatal(err)).toBe(false)
    expect((err as Error).message).toContain("結果未知")
  })
})

describe("listParentGroups", () => {
  test("asks by userKey and domain, pages, and lower-cases", async () => {
    const api = fakeApi([
      (u) => {
        if (u.pathname !== `${DIR}/groups`) return undefined
        return u.searchParams.get("pageToken") === "p2"
          ? json({ groups: [{ id: "2", email: "GCP-Org@winlab.tw" }] })
          : json({
              groups: [{ id: "1", email: "Staff@winlab.tw" }],
              nextPageToken: "p2",
            })
      },
    ])
    expect(await listParentGroups(api, "lab@winlab.tw")).toEqual([
      "staff@winlab.tw",
      "gcp-org@winlab.tw",
    ])
    const first = new URL(`https://x/${api.calls[0]!.split(" ")[1]}`)
    expect(first.searchParams.get("userKey")).toBe("lab@winlab.tw")
    expect(first.searchParams.get("domain")).toBe("winlab.tw")
    expect(first.searchParams.get("customer")).toBeNull()
    expect(first.searchParams.get("maxResults")).toBe("200")
  })

  test("a group with no parents is an empty list; an error throws", async () => {
    expect(
      await listParentGroups(fakeApi([() => json({})]), "a@winlab.tw")
    ).toEqual([])
    const err = await listParentGroups(
      fakeApi([() => json({}, 500)]),
      "a@winlab.tw"
    ).catch((e) => e)
    expect(err).toBeInstanceOf(GoogleGroupsError)
  })
})
