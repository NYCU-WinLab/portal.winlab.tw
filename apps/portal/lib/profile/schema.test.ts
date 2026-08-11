import { describe, expect, test } from "bun:test"

import { PROFILE_FIELDS } from "./schema"

// The validators this file used to cover are gone with the write path — the
// portal no longer PUTs to Keycloak, so there is no untrusted payload to
// validate. What survives is the list itself, which still decides what /profile
// displays about a member.
describe("PROFILE_FIELDS", () => {
  test("is exactly the set /profile renders", () => {
    const expected: string[] = [
      "chinese_name",
      "firstName",
      "lastName",
      "phone",
      "position",
      "gitlabUsername",
      "student_id",
    ]
    expect([...(PROFILE_FIELDS as readonly string[])].sort()).toEqual(
      expected.sort()
    )
  })

  // These were kept out when this was a write whitelist. They stay out now for
  // a quieter reason: they are identity, not profile, and showing them in a
  // section headed "要修改請前往 Keycloak" would invite exactly the confusion
  // the realm's own permissions exist to prevent.
  test("excludes identity and privilege fields", () => {
    const fields = PROFILE_FIELDS as readonly string[]
    expect(fields).not.toContain("email")
    expect(fields).not.toContain("role")
    expect(fields).not.toContain("username")
    expect(fields).not.toContain("is_admin")
  })
})
