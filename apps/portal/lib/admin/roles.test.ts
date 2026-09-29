import { describe, expect, test } from "bun:test"

import type { AdminUser } from "@/lib/admin/fetch"
import { applyRoleChanges, roleApps } from "@/lib/admin/roles"

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
