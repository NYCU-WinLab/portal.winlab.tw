import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test"

import {
  CLIENTS,
  desiredRepresentation,
  provisionAttribute,
  provisionClient,
  realmManagementId,
  type ClientSpec,
} from "./bootstrap"
import { KeycloakError, type UserProfileConfig } from "./keycloak"
import { Report } from "./report"

// Everything here runs against a fake admin API. A real request would mean a
// test reached a realm, so fail loudly if anything tries.
const realFetch = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error("network access in a kc unit test")
  }) as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

type Call = { method: "get" | "post" | "put"; path: string; body?: unknown }

/**
 * A stand-in for AdminApi. `routes` answers GETs by exact path; a route that
 * is an Error is thrown instead, like AdminApi does on a non-2xx. Writes are
 * recorded and succeed unless `failWrites` is set.
 */
function fakeApi(
  routes: Record<string, unknown>,
  options: { failWrites?: Error } = {}
) {
  const calls: Call[] = []
  const write =
    (method: "post" | "put") =>
    async (path: string, body: unknown): Promise<{ status: number }> => {
      calls.push({ method, path, body })
      if (options.failWrites) throw options.failWrites
      return { status: 204 }
    }
  return {
    calls,
    writes: () => calls.filter((c) => c.method !== "get"),
    api: {
      async get<T>(path: string): Promise<T> {
        calls.push({ method: "get", path })
        if (!(path in routes)) throw new Error(`unexpected GET ${path}`)
        const value = routes[path]
        if (value instanceof Error) throw value
        return structuredClone(value) as T
      },
      post: write("post"),
      put: write("put"),
    },
  }
}

// Report prints every line; capture them instead of cluttering test output.
let output: string[] = []
let logSpy: ReturnType<typeof spyOn>
beforeEach(() => {
  output = []
  logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    output.push(args.join(" "))
  })
})
afterEach(() => {
  logSpy.mockRestore()
})

const newReport = () => new Report((text) => text)
const printed = () => output.join("\n")

describe("CLIENTS / desiredRepresentation", () => {
  test("the read-only client is granted view-users and nothing else", () => {
    const cli = CLIENTS.find((c) => c.clientId === "winlab-kc-cli")
    expect(cli?.role).toBe("view-users")
  })

  test("every client is a confidential machine credential", () => {
    for (const spec of CLIENTS) {
      expect(desiredRepresentation(spec)).toMatchObject({
        clientId: spec.clientId,
        protocol: "openid-connect",
        enabled: true,
        publicClient: false,
        serviceAccountsEnabled: true,
        standardFlowEnabled: false,
        directAccessGrantsEnabled: false,
        implicitFlowEnabled: false,
        fullScopeAllowed: false,
      })
    }
  })
})

describe("realmManagementId", () => {
  const path = "/clients?clientId=realm-management"

  test("returns the realm-management client's id", async () => {
    const { api } = fakeApi({ [path]: [{ id: "rm-1", clientId: "x" }] })
    const report = newReport()
    expect(await realmManagementId(api, report)).toBe("rm-1")
    expect(report.failed).toBe(false)
  })

  test("fails when the realm has no realm-management client", async () => {
    const { api } = fakeApi({ [path]: [] })
    const report = newReport()
    expect(await realmManagementId(api, report)).toBeNull()
    expect(report.failed).toBe(true)
  })

  test("explains a 403 as a bootstrap account without admin rights", async () => {
    const { api } = fakeApi({ [path]: new KeycloakError("GET", 403) })
    const report = newReport()
    expect(await realmManagementId(api, report)).toBeNull()
    expect(printed()).toContain("403 — the bootstrap account cannot administer")
  })
})

describe("provisionAttribute", () => {
  const baseProfile: UserProfileConfig = {
    unmanagedAttributePolicy: "ADMIN_VIEW",
    attributes: [{ name: "username" }, { name: "email" }],
    groups: [{ name: "user-metadata" }],
  }

  test("dry run describes the change and writes nothing", async () => {
    const { api, writes } = fakeApi({ "/users/profile": baseProfile })
    const report = newReport()
    await provisionAttribute(api, "admissionYear", false, report)
    expect(writes()).toEqual([])
    expect(printed()).toContain('would declare "admissionYear"')
    expect(report.failed).toBe(false)
  })

  test("--apply appends the attribute and keeps everything else", async () => {
    const { api, writes } = fakeApi({ "/users/profile": baseProfile })
    const report = newReport()
    await provisionAttribute(api, "admissionYear", true, report)

    const [put, ...rest] = writes()
    expect(rest).toEqual([])
    expect(put?.method).toBe("put")
    expect(put?.path).toBe("/users/profile")
    // Never a partial PUT: the whole config goes back, with one addition.
    expect(put?.body).toEqual({
      ...baseProfile,
      attributes: [
        ...baseProfile.attributes!,
        {
          name: "admissionYear",
          displayName: "admissionYear",
          permissions: { view: ["admin"], edit: ["admin"] },
          annotations: { inputType: "text" },
        },
      ],
    })
    expect(report.failed).toBe(false)
  })

  test("leaves an admin-readable attribute alone, even with --apply", async () => {
    const profile: UserProfileConfig = {
      attributes: [
        { name: "admissionYear", permissions: { view: ["admin", "user"] } },
      ],
    }
    const { api, writes } = fakeApi({ "/users/profile": profile })
    const report = newReport()
    await provisionAttribute(api, "admissionYear", true, report)
    expect(writes()).toEqual([])
    expect(printed()).toContain("Already declared and admin-readable")
  })

  test("warns about, but does not widen, an attribute admin cannot see", async () => {
    const profile: UserProfileConfig = {
      attributes: [
        {
          name: "admissionYear",
          permissions: { view: ["user"], edit: ["user"] },
        },
      ],
    }
    const { api, writes } = fakeApi({ "/users/profile": profile })
    const report = newReport()
    await provisionAttribute(api, "admissionYear", true, report)
    expect(writes()).toEqual([])
    expect(printed()).toContain("Declared but not admin-readable")
    expect(report.failed).toBe(false)
  })

  test("fails without writing when the profile cannot be read", async () => {
    const { api, writes } = fakeApi({
      "/users/profile": new KeycloakError("GET /users/profile", 403),
    })
    const report = newReport()
    await provisionAttribute(api, "admissionYear", true, report)
    expect(writes()).toEqual([])
    expect(report.failed).toBe(true)
  })

  test("reports a rejected PUT as a failure", async () => {
    const { api } = fakeApi(
      { "/users/profile": baseProfile },
      { failWrites: new KeycloakError("PUT /users/profile", 400) }
    )
    const report = newReport()
    await provisionAttribute(api, "admissionYear", true, report)
    expect(report.failed).toBe(true)
    expect(printed()).toContain("Could not update the user profile config")
  })
})

describe("provisionClient", () => {
  const spec: ClientSpec = CLIENTS.find((c) => c.role === "view-users")!
  const lookup = `/clients?clientId=${encodeURIComponent(spec.clientId)}`
  const existing = { id: "c-1", clientId: spec.clientId, name: "old name" }
  const rolePath = `/clients/rm-1/roles/${spec.role}`

  const applyRoutes = (secret: unknown) => ({
    [lookup]: [existing],
    "/clients/c-1/service-account-user": { id: "sa-1" },
    [rolePath]: { id: "role-1", name: spec.role },
    "/clients/c-1/client-secret": secret,
  })

  test("dry run only reads, and returns no secret", async () => {
    const { api, writes } = fakeApi({ [lookup]: [] })
    const report = newReport()
    const secret = await provisionClient(api, spec, "rm-1", false, report, () =>
      expect.unreachable()
    )
    expect(secret).toBeNull()
    expect(writes()).toEqual([])
    expect(printed()).toContain("would create confidential client")
  })

  test("--apply reconciles an existing client and grants only its role", async () => {
    const { api, writes } = fakeApi(applyRoutes({ value: "s3cret" }))
    const seen: string[] = []
    const report = newReport()
    const secret = await provisionClient(api, spec, "rm-1", true, report, (v) =>
      seen.push(v)
    )

    expect(secret).toBe("s3cret")
    expect(seen).toEqual(["s3cret"])
    const mapping = [{ id: "role-1", name: spec.role }]
    expect(writes()).toEqual([
      {
        method: "put",
        path: "/clients/c-1",
        body: { ...existing, ...desiredRepresentation(spec) },
      },
      {
        method: "post",
        path: "/users/sa-1/role-mappings/clients/rm-1",
        body: mapping,
      },
      {
        method: "post",
        path: "/clients/c-1/scope-mappings/clients/rm-1",
        body: mapping,
      },
    ])
    expect(report.failed).toBe(false)
  })

  test("fails when the client comes back without a secret", async () => {
    const { api } = fakeApi(applyRoutes({}))
    const report = newReport()
    const secret = await provisionClient(api, spec, "rm-1", true, report, () =>
      expect.unreachable()
    )
    expect(secret).toBeNull()
    expect(report.failed).toBe(true)
  })
})
