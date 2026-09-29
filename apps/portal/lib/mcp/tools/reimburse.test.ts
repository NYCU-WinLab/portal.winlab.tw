import { describe, expect, test } from "bun:test"

import {
  AMOUNT,
  egressUpdates,
  ingressUpdates,
  matchApplicant,
} from "@/lib/mcp/tools/reimburse"

const MEMBERS = ["詹詠翔", "Mike Chen", "Mike Lin", "王小明"]

describe("matchApplicant", () => {
  test("takes an exact portal name", () => {
    expect(matchApplicant(MEMBERS, "詹詠翔")).toBe("詹詠翔")
  })

  test("forgives case and surrounding space, returning the stored spelling", () => {
    expect(matchApplicant(MEMBERS, "  mike chen ")).toBe("Mike Chen")
  })

  test("refuses a partial name and suggests the members it could mean", () => {
    expect(() => matchApplicant(MEMBERS, "Mike")).toThrow(
      /did you mean Mike Chen, Mike Lin/
    )
  })

  test("names shared by two accounts are suggested and matched once", () => {
    const withTwin = [...MEMBERS, "詹詠翔"]
    expect(() => matchApplicant(withTwin, "詠翔")).toThrow(
      /did you mean 詹詠翔\?$/
    )
    expect(matchApplicant(withTwin, " 詹詠翔")).toBe("詹詠翔")
  })

  test("refuses a name no member has", () => {
    expect(() => matchApplicant(MEMBERS, "Nobody")).toThrow(/picker/)
  })
})

describe("egressUpdates", () => {
  test("keeps only the fields that were passed", () => {
    expect(
      egressUpdates({ transfer_date: "2026-09-29", transfer_fee: 15 })
    ).toEqual({ transfer_date: "2026-09-29", transfer_fee: 15 })
  })

  test("keeps null, which clears a transfer", () => {
    expect(egressUpdates({ transfer_date: null, transfer_fee: null })).toEqual({
      transfer_date: null,
      transfer_fee: null,
    })
  })

  test("refuses an update with nothing in it", () => {
    expect(() => egressUpdates({})).toThrow(/nothing to change/)
  })
})

describe("ingressUpdates", () => {
  test("keeps only the fields that were passed, null included", () => {
    expect(
      ingressUpdates({ ingress_amount: 5000, ingress_comment: null })
    ).toEqual({ ingress_amount: 5000, ingress_comment: null })
  })

  test("refuses an update with nothing in it", () => {
    expect(() => ingressUpdates({})).toThrow(/nothing to change/)
  })
})

describe("AMOUNT", () => {
  test("takes whole and two-decimal amounts, as the web form does", () => {
    expect(AMOUNT.safeParse(19.99).success).toBe(true)
    expect(AMOUNT.safeParse(0.1 + 0.2).success).toBe(true)
    expect(AMOUNT.safeParse(1200).success).toBe(true)
  })

  test("refuses finer amounts and negative ones", () => {
    expect(AMOUNT.safeParse(100 / 3).success).toBe(false)
    expect(AMOUNT.safeParse(0.005).success).toBe(false)
    expect(AMOUNT.safeParse(-1).success).toBe(false)
  })
})

describe("ingressUpdates with an empty note", () => {
  test("clears the note, as the web does with an empty box", () => {
    expect(ingressUpdates({ ingress_comment: "" })).toEqual({
      ingress_comment: null,
    })
  })
})
