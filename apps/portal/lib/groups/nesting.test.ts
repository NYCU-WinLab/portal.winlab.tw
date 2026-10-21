import { describe, expect, test } from "bun:test"

import {
  findForbiddenAncestor,
  NestingTooDeepError,
} from "@/lib/groups/nesting"

const tree =
  (parents: Record<string, string[]>) =>
  async (email: string): Promise<string[]> =>
    parents[email] ?? []

describe("findForbiddenAncestor", () => {
  test("no parents is clean", async () => {
    expect(
      await findForbiddenAncestor(tree({}), "a@winlab.tw", "winlab.tw")
    ).toBeNull()
  })

  test("a gcp-* parent is found", async () => {
    expect(
      await findForbiddenAncestor(
        tree({ "a@winlab.tw": ["gcp-billing@winlab.tw"] }),
        "a@winlab.tw",
        "winlab.tw"
      )
    ).toBe("gcp-billing@winlab.tw")
  })

  test("a gcp-* grandparent is found, and a parent outside the domain too", async () => {
    expect(
      await findForbiddenAncestor(
        tree({
          "a@winlab.tw": ["b@winlab.tw"],
          "b@winlab.tw": ["c@winlab.tw", "GCP-Org@winlab.tw"],
        }),
        "a@winlab.tw",
        "winlab.tw"
      )
    ).toBe("gcp-org@winlab.tw")
    expect(
      await findForbiddenAncestor(
        tree({ "a@winlab.tw": ["x@other.org"] }),
        "a@winlab.tw",
        "winlab.tw"
      )
    ).toBe("x@other.org")
  })

  test("a clean ancestry is allowed", async () => {
    expect(
      await findForbiddenAncestor(
        tree({
          "a@winlab.tw": ["b@winlab.tw"],
          "b@winlab.tw": ["c@winlab.tw"],
        }),
        "a@winlab.tw",
        "winlab.tw"
      )
    ).toBeNull()
  })

  test("exactly three clean levels are allowed", async () => {
    expect(
      await findForbiddenAncestor(
        tree({
          "a@winlab.tw": ["g1@winlab.tw"],
          "g1@winlab.tw": ["g2@winlab.tw"],
          "g2@winlab.tw": ["g3@winlab.tw"],
        }),
        "a@winlab.tw",
        "winlab.tw"
      )
    ).toBeNull()
  })

  test("a fourth level is refused as too deep, but a forbidden one there is named", async () => {
    const four = {
      "a@winlab.tw": ["g1@winlab.tw"],
      "g1@winlab.tw": ["g2@winlab.tw"],
      "g2@winlab.tw": ["g3@winlab.tw"],
      "g3@winlab.tw": ["g4@winlab.tw"],
    }
    await expect(
      findForbiddenAncestor(tree(four), "a@winlab.tw", "winlab.tw")
    ).rejects.toBeInstanceOf(NestingTooDeepError)
    expect(
      await findForbiddenAncestor(
        tree({ ...four, "g3@winlab.tw": ["gcp-x@winlab.tw"] }),
        "a@winlab.tw",
        "winlab.tw"
      )
    ).toBe("gcp-x@winlab.tw")
  })

  test("a cycle terminates", async () => {
    let calls = 0
    const parentsOf = async (email: string) => {
      calls++
      return email === "a@winlab.tw" ? ["b@winlab.tw"] : ["a@winlab.tw"]
    }
    expect(
      await findForbiddenAncestor(parentsOf, "a@winlab.tw", "winlab.tw")
    ).toBeNull()
    expect(calls).toBe(2)
  })

  test("a failing lookup propagates, so the caller fails closed", async () => {
    const boom = async () => {
      throw new Error("500")
    }
    await expect(
      findForbiddenAncestor(boom, "a@winlab.tw", "winlab.tw")
    ).rejects.toThrow("500")
  })

  test("ancestry deeper than the bound can't be vouched for", async () => {
    let n = 0
    const chain = async () => [`g${n++}@winlab.tw`]
    await expect(
      findForbiddenAncestor(chain, "a@winlab.tw", "winlab.tw", 3)
    ).rejects.toBeInstanceOf(NestingTooDeepError)
  })
})
