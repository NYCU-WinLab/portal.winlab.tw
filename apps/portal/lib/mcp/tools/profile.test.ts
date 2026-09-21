import { describe, expect, test } from "bun:test"

import { keycloakAccount } from "@/lib/mcp/tools/profile"

describe("keycloakAccount", () => {
  test("renames the camelCase Keycloak fields to snake_case", () => {
    expect(
      keycloakAccount({
        status: "ok",
        profile: {
          chinese_name: "詹詠翔",
          firstName: "Yong-Xiang",
          lastName: "Zhan",
          phone: "0912345678",
          position: "Master student",
          gitlabUsername: "zyx1121",
          student_id: "313552013",
        },
      })
    ).toEqual({
      chinese_name: "詹詠翔",
      first_name: "Yong-Xiang",
      last_name: "Zhan",
      phone: "0912345678",
      position: "Master student",
      gitlab_username: "zyx1121",
      student_id: "313552013",
    })
  })

  test("turns unfilled fields into null", () => {
    const account = keycloakAccount({
      status: "ok",
      profile: {
        chinese_name: "詹詠翔",
        firstName: "",
        lastName: "",
        phone: "",
        position: "",
        gitlabUsername: "",
        student_id: "",
      },
    })
    expect(account?.chinese_name).toBe("詹詠翔")
    expect(account?.phone).toBeNull()
    expect(account?.gitlab_username).toBeNull()
  })

  test("is null when Keycloak is unconfigured or unreachable", () => {
    expect(keycloakAccount({ status: "unconfigured" })).toBeNull()
    expect(keycloakAccount({ status: "unavailable" })).toBeNull()
  })
})
