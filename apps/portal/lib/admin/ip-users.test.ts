import { describe, expect, test } from "bun:test"

import {
  ipUserInput,
  deleteIpUserInput,
  networkInfo,
  ipUserError,
} from "./ip-users"

const entry = {
  id: null,
  ip: "192.0.2.10",
  user_name: "  Shared workstation  ",
  category: "shared",
  notes: "  Keep this address reserved  ",
  expected_revision: null,
}

describe("IP USER input", () => {
  test("preserves shared labels and trims surrounding whitespace", () => {
    const parsed = ipUserInput.parse(entry)
    expect(parsed.user_name).toBe("Shared workstation")
    expect(parsed.notes).toBe("Keep this address reserved")
  })

  test("allows an unnamed address with a reservation note", () => {
    expect(ipUserInput.parse({ ...entry, user_name: "" }).notes).toContain(
      "reserved"
    )
  })

  test.each(["192.0.2", "192.0.2.256", "192.0.2.10/24", "::1", "192.00.2.10"])(
    "rejects non-host IPv4 input %s",
    (ip) => expect(ipUserInput.safeParse({ ...entry, ip }).success).toBe(false)
  )

  test("requires a revision when updating an existing entry", () => {
    const id = "d88f631c-de19-43f2-87a7-bc37b57f2282"
    expect(ipUserInput.safeParse({ ...entry, id }).success).toBe(false)
    expect(
      ipUserInput.safeParse({ ...entry, id, expected_revision: 1 }).success
    ).toBe(true)
    expect(
      ipUserInput.safeParse({ ...entry, expected_revision: 1 }).success
    ).toBe(false)
  })

  test("rejects unknown categories and oversized fields", () => {
    for (const patch of [
      { category: "admin" },
      { user_name: "a".repeat(201) },
      { notes: "a".repeat(2001) },
    ]) {
      expect(ipUserInput.safeParse({ ...entry, ...patch }).success).toBe(false)
    }
  })

  test("deletion requires an entry id and a positive revision", () => {
    expect(
      deleteIpUserInput.safeParse({ id: null, expected_revision: 1 }).success
    ).toBe(false)
    expect(
      deleteIpUserInput.safeParse({
        id: "d88f631c-de19-43f2-87a7-bc37b57f2282",
        expected_revision: 0,
      }).success
    ).toBe(false)
  })
})

describe("network metadata", () => {
  test("derives netmask and reserved endpoints from the supplied subnet", () => {
    expect(networkInfo("192.0.2.224/27")).toEqual({
      network: "192.0.2.224",
      broadcast: "192.0.2.255",
      netmask: "255.255.255.224",
    })
  })

  test("does not assume every subnet is a /24", () => {
    expect(networkInfo("198.51.100.128/25").broadcast).toBe("198.51.100.255")
    expect(networkInfo("10.0.0.0/8").netmask).toBe("255.0.0.0")
  })
})

test("duplicate IP errors explain the conflict without returning database internals", () => {
  expect(
    ipUserError({ code: "22023", message: "IP address already exists" })
  ).toBe("這個 IP 已有紀錄")
  expect(
    ipUserError({ code: "XX000", message: "private database details" })
  ).not.toContain("private")
})
