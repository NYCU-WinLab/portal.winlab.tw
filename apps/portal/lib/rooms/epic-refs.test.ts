import { describe, expect, test } from "bun:test"

import {
  formatEpicRef,
  issueRefsParam,
  parseEpicRef,
  sanitizeIssueRefs,
} from "./epic-refs"

const GROUP = "winlab/network-system-design/tasa-satsim"

describe("parseEpicRef", () => {
  test("reads the URL a person copies out of the address bar", () => {
    expect(
      parseEpicRef(`https://gitlab.winlab.tw/groups/${GROUP}/-/epics/4`)
    ).toEqual({ groupPath: GROUP, iid: 4 })
  })

  test("reads GitLab's own reference form", () => {
    expect(parseEpicRef(`${GROUP}&4`)).toEqual({ groupPath: GROUP, iid: 4 })
  })

  // `4` and `&4` name an iid without saying whose, so they only resolve when
  // the caller already knows the group.
  test("resolves a bare iid against the group in hand", () => {
    expect(parseEpicRef("4", GROUP)).toEqual({ groupPath: GROUP, iid: 4 })
    expect(parseEpicRef("&4", GROUP)).toEqual({ groupPath: GROUP, iid: 4 })
  })

  test("a bare iid with no group is unresolvable, not a guess", () => {
    expect(parseEpicRef("4")).toBeNull()
    expect(parseEpicRef("&4", "  ")).toBeNull()
  })

  // An issue is not an epic. The pipeline's branch is "put the marker on that
  // epic" — handing it an issue is a request it has no answer for.
  test("drops an issue reference rather than rewriting it as an epic", () => {
    expect(parseEpicRef(`${GROUP}#12`)).toBeNull()
    expect(
      parseEpicRef(`https://gitlab.winlab.tw/${GROUP}/-/issues/12`)
    ).toBeNull()
  })

  test("drops junk", () => {
    expect(parseEpicRef("")).toBeNull()
    expect(parseEpicRef("   ")).toBeNull()
    expect(parseEpicRef("epic four")).toBeNull()
    expect(parseEpicRef(`${GROUP}&`)).toBeNull()
  })

  test("tolerates surrounding whitespace", () => {
    expect(parseEpicRef(`  ${GROUP}&7  `)).toEqual({ groupPath: GROUP, iid: 7 })
  })

  // The lab's GitLab nests three levels and the depth has already moved once,
  // so nothing here may assume a fixed number of segments.
  test("handles any nesting depth", () => {
    expect(parseEpicRef("winlab&1")).toEqual({ groupPath: "winlab", iid: 1 })
    expect(parseEpicRef("a/b/c/d&2")).toEqual({ groupPath: "a/b/c/d", iid: 2 })
  })
})

describe("sanitizeIssueRefs", () => {
  test("canonicalises every accepted form to one string", () => {
    expect(
      sanitizeIssueRefs(
        [`https://gitlab.winlab.tw/groups/${GROUP}/-/epics/4`, `${GROUP}&5`],
        GROUP
      )
    ).toEqual([`${GROUP}&4`, `${GROUP}&5`])
  })

  test("de-duplicates across forms that mean the same epic", () => {
    expect(
      sanitizeIssueRefs(
        [
          `${GROUP}&4`,
          `https://gitlab.winlab.tw/groups/${GROUP}/-/epics/4`,
          "4",
        ],
        GROUP
      )
    ).toEqual([`${GROUP}&4`])
  })

  // Not a set: the first epic is the one a reader treats as the meeting's
  // home, so the caller's order is the answer.
  test("keeps the caller's order", () => {
    expect(sanitizeIssueRefs(["9", "2"], GROUP)).toEqual([
      `${GROUP}&9`,
      `${GROUP}&2`,
    ])
  })

  test("drops what it can't resolve instead of failing the booking", () => {
    expect(sanitizeIssueRefs(["nonsense", `${GROUP}&4`, ""], GROUP)).toEqual([
      `${GROUP}&4`,
    ])
  })

  test("empty in, empty out", () => {
    expect(sanitizeIssueRefs([])).toEqual([])
  })
})

describe("formatEpicRef", () => {
  test("prints the form GitLab prints", () => {
    expect(formatEpicRef({ groupPath: GROUP, iid: 4 })).toBe(`${GROUP}&4`)
  })
})

describe("issueRefsParam", () => {
  test("comma-separated, the shape the trigger takes", () => {
    expect(issueRefsParam([`${GROUP}&4`, "winlab&1"])).toBe(
      `${GROUP}&4,winlab&1`
    )
  })

  test("an empty selection is an empty string, not a stray comma", () => {
    expect(issueRefsParam([])).toBe("")
  })
})
