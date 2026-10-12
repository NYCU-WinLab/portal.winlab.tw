import { describe, expect, test } from "bun:test"

import { isListed, toDirectoryMember, toMemberRole } from "./members"

describe("directory roster", () => {
  test("excludes disabled and test accounts without excluding similar names", () => {
    expect(isListed({ id: "1", enabled: false, username: "member" })).toBe(
      false
    )
    for (const username of [
      "test",
      "winlab-test-master",
      "test_master",
      "a.test",
    ]) {
      expect(isListed({ id: "1", enabled: true, username })).toBe(false)
    }
    expect(isListed({ id: "1", enabled: true, username: "contest" })).toBe(true)
  })

  test("keeps malformed roles visible as pending, including prototype names", () => {
    const unknown = new Map<string, string>()
    expect(toMemberRole("master", "1", unknown)).toBe("master")
    expect(toMemberRole("toString", "2", unknown)).toBe("pending")
    expect(toMemberRole(undefined, "3", unknown)).toBe("pending")
    expect([...unknown]).toEqual([["2", "toString"]])
  })

  test("maps Keycloak contact attributes and handles missing optional fields", () => {
    const member = toDirectoryMember(
      {
        id: "1",
        username: "member",
        email: "member@example.com",
        firstName: "First",
        lastName: "Last",
        attributes: {
          chinese_name: ["王小明"],
          phone: ["0123456"],
          student_id: ["123"],
          role: ["master"],
          position: ["碩士一年級"],
          research_areas: ["Networks"],
        },
      },
      new Map()
    )
    expect(member).toMatchObject({
      name: "王小明",
      nameEn: "First Last",
      phone: "0123456",
      studentId: "123",
      role: "master",
      position: "碩士一年級",
      researchAreas: ["Networks"],
    })
    expect(
      toDirectoryMember({ id: "2", username: "fallback" }, new Map())
    ).toMatchObject({
      name: "fallback",
      email: "",
      role: "pending",
      researchAreas: [],
    })
  })
})
