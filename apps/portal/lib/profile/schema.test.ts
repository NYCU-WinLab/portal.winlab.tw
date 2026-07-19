import { describe, expect, test } from "bun:test"

import {
  EDITABLE_PROFILE_FIELDS,
  validateField,
  validateProfileUpdate,
} from "@/lib/profile/schema"

// Written via escape so the exact bytes in this source file are
// unambiguous (avoids any copy/paste mangling of the CJK text).
const WANG_XIAO_MING = "王小明"

describe("EDITABLE_PROFILE_FIELDS", () => {
  test("is exactly the seven user-editable Keycloak fields", () => {
    const expected = [
      "chinese_name",
      "firstName",
      "lastName",
      "phone",
      "position",
      "gitlabUsername",
      "student_id",
    ] as const
    expect([...EDITABLE_PROFILE_FIELDS].sort()).toEqual([...expected].sort())
  })

  test("does not include email, role, or username", () => {
    expect(EDITABLE_PROFILE_FIELDS).not.toContain("email")
    expect(EDITABLE_PROFILE_FIELDS).not.toContain("role")
    expect(EDITABLE_PROFILE_FIELDS).not.toContain("username")
  })
})

describe("validateProfileUpdate — unknown keys are rejected", () => {
  test("role is rejected with an error on that key", () => {
    const result = validateProfileUpdate({ role: "professor" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.role).toBeDefined()
    }
  })

  test("username is rejected with an error on that key", () => {
    const result = validateProfileUpdate({ username: "x" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.username).toBeDefined()
    }
  })

  test("is_admin is rejected", () => {
    const result = validateProfileUpdate({ is_admin: true })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.is_admin).toBeDefined()
    }
  })

  test("email is rejected (handled elsewhere, not editable here)", () => {
    const result = validateProfileUpdate({ email: "a@b.com" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.email).toBeDefined()
    }
  })

  test("a known field alongside an unknown field still fails overall", () => {
    const result = validateProfileUpdate({
      firstName: "Claude",
      role: "professor",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.role).toBeDefined()
      expect(result.errors.firstName).toBeUndefined()
    }
  })
})

describe("validateProfileUpdate — non-string values", () => {
  test("a present known key with a non-string value is an error", () => {
    const result = validateProfileUpdate({ phone: 12345 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.phone).toBeDefined()
    }
  })

  test("null value for a present known key is an error", () => {
    const result = validateProfileUpdate({ student_id: null })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.student_id).toBeDefined()
    }
  })
})

describe("validateProfileUpdate — partial update semantics", () => {
  test("only validates keys that are present", () => {
    const result = validateProfileUpdate({ position: "RA" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ position: "RA" })
    }
  })

  test("empty input is a valid (no-op) update", () => {
    const result = validateProfileUpdate({})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({})
    }
  })

  test("a valid multi-field update returns trimmed values", () => {
    const result = validateProfileUpdate({
      chinese_name: `  ${WANG_XIAO_MING}  `,
      firstName: " Claude ",
      lastName: "Shannon",
      phone: " +886 912-345-678 ",
      position: " RA ",
      gitlabUsername: " john.doe ",
      student_id: " 313552013 ",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        chinese_name: WANG_XIAO_MING,
        firstName: "Claude",
        lastName: "Shannon",
        phone: "+886 912-345-678",
        position: "RA",
        gitlabUsername: "john.doe",
        student_id: "313552013",
      })
    }
  })
})

describe("student_id", () => {
  test("9 digits is valid", () => {
    expect(validateField("student_id", "313552013")).toEqual({
      ok: true,
      value: "313552013",
    })
  })

  test("8 digits is invalid", () => {
    expect(validateField("student_id", "31355201").ok).toBe(false)
  })

  test("10 digits is invalid", () => {
    expect(validateField("student_id", "3135520133").ok).toBe(false)
  })

  test("non-digit characters are invalid", () => {
    expect(validateField("student_id", "31355201a").ok).toBe(false)
  })

  test("empty string is allowed (clears the field)", () => {
    expect(validateField("student_id", "")).toEqual({ ok: true, value: "" })
  })
})

describe("chinese_name", () => {
  test("a normal name is valid", () => {
    expect(validateField("chinese_name", WANG_XIAO_MING)).toEqual({
      ok: true,
      value: WANG_XIAO_MING,
    })
  })

  test("empty is invalid — can't clear your display name", () => {
    expect(validateField("chinese_name", "").ok).toBe(false)
  })

  test("a 51-character string is invalid", () => {
    const tooLong = "a".repeat(51)
    expect(validateField("chinese_name", tooLong).ok).toBe(false)
  })

  test("a 50-character string is valid", () => {
    const justRight = "a".repeat(50)
    expect(validateField("chinese_name", justRight).ok).toBe(true)
  })

  test("a control character is invalid", () => {
    expect(validateField("chinese_name", "\x01" + WANG_XIAO_MING).ok).toBe(
      false
    )
  })
})

describe("firstName / lastName", () => {
  test("a string containing '<' is invalid", () => {
    expect(validateField("firstName", "<script>").ok).toBe(false)
  })

  test("a normal name is valid", () => {
    expect(validateField("firstName", "Claude")).toEqual({
      ok: true,
      value: "Claude",
    })
  })

  test("empty is invalid", () => {
    expect(validateField("firstName", "").ok).toBe(false)
  })

  test("each Keycloak-prohibited character is individually rejected", () => {
    const prohibited = [
      "<",
      ">",
      "&",
      '"',
      "$",
      "%",
      "!",
      "#",
      "?",
      "§",
      ",",
      ";",
      ":",
    ]
    for (const ch of prohibited) {
      expect(validateField("lastName", `a${ch}b`).ok).toBe(false)
    }
  })

  test("a 256-character name is invalid", () => {
    expect(validateField("lastName", "a".repeat(256)).ok).toBe(false)
  })

  test("a control character is invalid", () => {
    expect(validateField("lastName", "a\x01b").ok).toBe(false)
  })
})

describe("phone", () => {
  test("a well-formed phone number is valid", () => {
    expect(validateField("phone", "+886 912-345-678")).toEqual({
      ok: true,
      value: "+886 912-345-678",
    })
  })

  test("letters are invalid", () => {
    expect(validateField("phone", "abc").ok).toBe(false)
  })

  test("empty string is allowed (clears the field)", () => {
    expect(validateField("phone", "")).toEqual({ ok: true, value: "" })
  })

  test("allowed punctuation with no digits is invalid", () => {
    expect(validateField("phone", "+-()").ok).toBe(false)
  })

  test("a 31-character phone number is invalid", () => {
    expect(validateField("phone", "1".repeat(31)).ok).toBe(false)
  })
})

describe("position", () => {
  test("a normal position is valid", () => {
    expect(validateField("position", "RA")).toEqual({ ok: true, value: "RA" })
  })

  test("empty string is allowed (clears the field)", () => {
    expect(validateField("position", "")).toEqual({ ok: true, value: "" })
  })

  test("a 101-character position is invalid", () => {
    expect(validateField("position", "a".repeat(101)).ok).toBe(false)
  })

  test("a control character is invalid", () => {
    expect(validateField("position", "a\x01b").ok).toBe(false)
  })
})

describe("gitlabUsername", () => {
  test("john.doe is valid", () => {
    expect(validateField("gitlabUsername", "john.doe")).toEqual({
      ok: true,
      value: "john.doe",
    })
  })

  test("consecutive dots are invalid", () => {
    expect(validateField("gitlabUsername", "john..doe").ok).toBe(false)
  })

  test("leading dot is invalid", () => {
    expect(validateField("gitlabUsername", ".john").ok).toBe(false)
  })

  test("'!' is not an allowed character", () => {
    expect(validateField("gitlabUsername", "john!").ok).toBe(false)
  })

  test("empty string is allowed (clears the field)", () => {
    expect(validateField("gitlabUsername", "")).toEqual({
      ok: true,
      value: "",
    })
  })

  test("trailing dot is invalid", () => {
    expect(validateField("gitlabUsername", "john.").ok).toBe(false)
  })

  test("starting with a digit or underscore is valid", () => {
    expect(validateField("gitlabUsername", "1john").ok).toBe(true)
    expect(validateField("gitlabUsername", "_john").ok).toBe(true)
  })

  test("starting with '-' is invalid", () => {
    expect(validateField("gitlabUsername", "-john").ok).toBe(false)
  })

  test("a 256-character username is invalid", () => {
    expect(validateField("gitlabUsername", "a".repeat(256)).ok).toBe(false)
  })
})
