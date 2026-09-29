import { describe, expect, test } from "bun:test"

import type { AdminUser } from "@/lib/admin/fetch"
import { applyRoleChanges, roleApps, sameRoles } from "@/lib/admin/roles"

const APPS = ["approve", "bento", "door", "trip"]

describe("applyRoleChanges", () => {
  test("grants set the app to admin and keep the other apps", () => {
    expect(
      applyRoleChanges({ bento: ["admin"] }, { grant: ["trip"] }, APPS)
    ).toEqual({ bento: ["admin"], trip: ["admin"] })
  })

  test("revokes drop the app", () => {
    expect(
      applyRoleChanges(
        { bento: ["admin"], trip: ["admin"] },
        { revoke: ["trip"] },
        APPS
      )
    ).toEqual({ bento: ["admin"] })
  })

  test("revoking an app they do not hold changes nothing", () => {
    expect(
      applyRoleChanges({ bento: ["admin"] }, { revoke: ["door"] }, APPS)
    ).toEqual({ bento: ["admin"] })
  })

  test("does not touch the roles it was given", () => {
    const roles = { bento: ["admin"] }
    applyRoleChanges(roles, { grant: ["trip"], revoke: ["bento"] }, APPS)
    expect(roles).toEqual({ bento: ["admin"] })
  })

  test("keeps an app's other roles on grant and revoke", () => {
    expect(
      applyRoleChanges({ bento: ["user"] }, { grant: ["bento"] }, APPS)
    ).toEqual({ bento: ["user", "admin"] })
    expect(
      applyRoleChanges(
        { bento: ["user", "admin"] },
        { revoke: ["bento"] },
        APPS
      )
    ).toEqual({ bento: ["user"] })
  })

  test("granting an app they already administer changes nothing", () => {
    expect(
      applyRoleChanges({ trip: ["admin"] }, { grant: ["trip"] }, APPS)
    ).toEqual({ trip: ["admin"] })
  })

  test("leaves apps it was not asked about exactly as they were", () => {
    expect(
      applyRoleChanges({ trip: [], bento: ["user"] }, { grant: ["door"] }, APPS)
    ).toEqual({ trip: [], bento: ["user"], door: ["admin"] })
  })

  test("copes with an app whose list is null", () => {
    const roles = { trip: null } as unknown as Record<string, string[]>
    expect(applyRoleChanges(roles, { revoke: ["trip"] }, APPS)).toEqual({})
    expect(applyRoleChanges(roles, { grant: ["trip"] }, APPS)).toEqual({
      trip: ["admin"],
    })
  })

  test("matches app names as stored, without folding case", () => {
    expect(() => applyRoleChanges({}, { grant: ["Trip"] }, APPS)).toThrow(
      /no role for Trip/
    )
  })

  test("refuses an app with no role", () => {
    expect(() => applyRoleChanges({}, { grant: ["games"] }, APPS)).toThrow(
      /no role for games/
    )
  })

  test("refuses granting and revoking the same app", () => {
    expect(() =>
      applyRoleChanges({}, { grant: ["trip"], revoke: ["trip"] }, APPS)
    ).toThrow(/both grant and revoke trip/)
  })
})

describe("roleApps", () => {
  test("adds apps members already hold to the known ones, sorted", () => {
    const users = [
      {
        id: "1",
        name: null,
        email: "a@x",
        is_admin: false,
        roles: { zeta: ["admin"] },
      },
    ] as AdminUser[]
    const apps = roleApps(users)
    expect(apps).toContain("zeta")
    expect(apps).toContain("trip")
    expect(apps).toEqual([...apps].sort())
  })
})

describe("sameRoles", () => {
  test("ignores the order of apps and of roles", () => {
    expect(
      sameRoles(
        { trip: ["admin"], bento: ["user", "admin"] },
        { bento: ["admin", "user"], trip: ["admin"] }
      )
    ).toBe(true)
  })

  test("tells a missing app or role apart", () => {
    expect(sameRoles({ trip: ["admin"] }, {})).toBe(false)
    expect(sameRoles({ bento: ["user"] }, { bento: ["admin"] })).toBe(false)
  })
})
