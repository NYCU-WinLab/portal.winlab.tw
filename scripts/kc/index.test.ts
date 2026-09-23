import { describe, expect, test } from "bun:test"

import { defaultConfigPath } from "./config"
// Importing the entry point must not run the CLI (it would process.exit).
import { parseArgs, USAGE } from "./index"

describe("parseArgs", () => {
  test("no command, --help and -h mean usage", () => {
    expect(parseArgs([])).toBeNull()
    expect(parseArgs(["--help"])).toBeNull()
    expect(parseArgs(["-h"])).toBeNull()
    expect(USAGE).toContain("bun run kc doctor")
  })

  test("defaults to the read-only profile and a dry run", () => {
    expect(parseArgs(["doctor"])).toEqual({
      command: "doctor",
      profile: "cli",
      apply: false,
      list: false,
      limit: 500,
      configPath: defaultConfigPath(),
    })
  })

  test("reads every option", () => {
    expect(
      parseArgs([
        "users",
        "--profile",
        "app",
        "--attr",
        "admissionYear",
        "--user",
        "a@b.c",
        "--list",
        "--limit",
        "10",
        "--plan",
        "plan.tsv",
        "--apply",
        "--config",
        "/tmp/kc.env",
      ])
    ).toEqual({
      command: "users",
      profile: "app",
      attribute: "admissionYear",
      user: "a@b.c",
      list: true,
      limit: 10,
      plan: "plan.tsv",
      apply: true,
      configPath: "/tmp/kc.env",
    })
  })

  test("rejects bad values and unknown options", () => {
    expect(() => parseArgs(["users", "--limit", "0"])).toThrow(
      "--limit needs a positive integer"
    )
    expect(() => parseArgs(["users", "--limit", "x"])).toThrow()
    expect(() => parseArgs(["doctor", "--profile", "admin"])).toThrow(
      "--profile must be `cli` or `app`"
    )
    expect(() => parseArgs(["doctor", "--attr"])).toThrow()
    expect(() => parseArgs(["doctor", "--bogus"])).toThrow(
      "unknown option: --bogus"
    )
  })
})
