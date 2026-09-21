import { describe, expect, test } from "bun:test"

import type { AdminUser } from "@/lib/admin/fetch"
import { filterAdminUsers } from "@/lib/mcp/tools/admin"

const users: AdminUser[] = [
  {
    id: "1",
    name: "Loki",
    email: "loki@winlab.tw",
    is_admin: true,
    roles: {},
  },
  {
    id: "2",
    name: "Ada",
    email: "ada@winlab.tw",
    is_admin: false,
    roles: { trip: ["admin"], bento: ["member"] },
  },
  {
    id: "3",
    name: null,
    email: "carol@winlab.tw",
    is_admin: false,
    roles: { trip: ["member"] },
  },
]

describe("filterAdminUsers", () => {
  test("returns everyone when no filter is given", () => {
    expect(filterAdminUsers(users, {}).map((u) => u.id)).toEqual([
      "1",
      "2",
      "3",
    ])
  })

  test("keeps only members holding any role in the app", () => {
    expect(
      filterAdminUsers(users, { roleApp: "trip" }).map((u) => u.id)
    ).toEqual(["2", "3"])
  })

  test("matches the app name case-insensitively", () => {
    expect(
      filterAdminUsers(users, { roleApp: "TRIP" }).map((u) => u.id)
    ).toEqual(["2", "3"])
  })

  test("admins_only keeps super admins and admin role holders", () => {
    expect(
      filterAdminUsers(users, { adminsOnly: true }).map((u) => u.id)
    ).toEqual(["1", "2"])
  })

  test("admins_only with an app means admin of that app", () => {
    expect(
      filterAdminUsers(users, { roleApp: "bento", adminsOnly: true }).map(
        (u) => u.id
      )
    ).toEqual([])
  })

  test("query matches name or email, case-insensitively", () => {
    expect(filterAdminUsers(users, { query: "lok" }).map((u) => u.id)).toEqual([
      "1",
    ])
    expect(
      filterAdminUsers(users, { query: "CAROL@" }).map((u) => u.id)
    ).toEqual(["3"])
  })

  test("query tolerates a null name", () => {
    expect(filterAdminUsers(users, { query: "ada" }).map((u) => u.id)).toEqual([
      "2",
    ])
  })

  test("combines the filters", () => {
    expect(
      filterAdminUsers(users, {
        roleApp: "trip",
        adminsOnly: true,
        query: "winlab.tw",
      }).map((u) => u.id)
    ).toEqual(["2"])
  })
})
