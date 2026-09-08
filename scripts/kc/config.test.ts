import { describe, expect, test } from "bun:test"

import { parseEnvFile, redactor } from "./config"

describe("parseEnvFile", () => {
  test("reads plain pairs and ignores comments and blanks", () => {
    expect(
      parseEnvFile("# a comment\n\nKEYCLOAK_REALM=winlab\n  \nFOO=bar\n")
    ).toEqual({ KEYCLOAK_REALM: "winlab", FOO: "bar" })
  })

  test("strips surrounding quotes but not inner ones", () => {
    expect(parseEnvFile(`A="quoted"\nB='single'\nC=say "hi"`)).toEqual({
      A: "quoted",
      B: "single",
      C: 'say "hi"',
    })
  })

  test("keeps '=' inside values — base64 secrets end in them", () => {
    expect(parseEnvFile("SECRET=abc==")).toEqual({ SECRET: "abc==" })
  })

  test("skips lines with no assignment", () => {
    expect(parseEnvFile("just-a-word\nA=1")).toEqual({ A: "1" })
  })
})

describe("redactor", () => {
  test("scrubs a secret wherever it appears", () => {
    const redact = redactor(["hunter2-hunter2"])
    expect(redact("secret=hunter2-hunter2 in body")).toBe(
      "secret=«redacted» in body"
    )
  })

  test("scrubs every occurrence, not just the first", () => {
    const redact = redactor(["hunter2-hunter2"])
    expect(redact("hunter2-hunter2 hunter2-hunter2")).toBe(
      "«redacted» «redacted»"
    )
  })

  // A short secret would match common substrings and redact half the output,
  // hiding the diagnostics the tool exists to print.
  test("ignores strings too short to be a real secret", () => {
    expect(redactor(["abc"])("abcdef")).toBe("abcdef")
  })

  test("redacts the longer secret when one contains the other", () => {
    const redact = redactor(["prefix-secret", "prefix-secret-longer"])
    expect(redact("prefix-secret-longer")).toBe("«redacted»")
  })

  test("passes text through when there are no secrets", () => {
    expect(redactor([])("nothing to hide")).toBe("nothing to hide")
  })

  // bootstrap only learns the client secrets partway through its run, so the
  // redactor has to pick up values pushed after it was built.
  test("scrubs secrets added after it was created", () => {
    const secrets: string[] = []
    const redact = redactor(secrets)
    expect(redact("value later-secret-value")).toBe("value later-secret-value")
    secrets.push("later-secret-value")
    expect(redact("value later-secret-value")).toBe("value «redacted»")
  })
})
