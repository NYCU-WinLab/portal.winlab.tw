import { describe, expect, test } from "bun:test"

import {
  deliverablesFromIssues,
  deliverablesFromLabels,
  isPublicEpic,
  readEpic,
  readEpics,
} from "./epics"

function raw(overrides: Record<string, unknown> = {}) {
  return {
    iid: 4,
    title: "Link budget rework",
    description: "Re-run the budget against the new antenna.",
    web_url: "https://gitlab.winlab.tw/groups/winlab/tasa-satsim/-/epics/4",
    confidential: false,
    ...overrides,
  }
}

describe("deliverablesFromLabels", () => {
  test("picks out the scoped deliverable labels", () => {
    expect(
      deliverablesFromLabels(["workflow::doing", "Deliverable::Code", "p1"])
    ).toEqual(["Deliverable::Code"])
  })

  test("normalises to the canonical order", () => {
    expect(
      deliverablesFromLabels(["Deliverable::Demo", "Deliverable::Presentation"])
    ).toEqual(["Deliverable::Presentation", "Deliverable::Demo"])
  })

  test("an epic with no deliverable labels has none", () => {
    expect(deliverablesFromLabels(["workflow::doing"])).toEqual([])
    expect(deliverablesFromLabels([])).toEqual([])
  })

  test("is case-sensitive — GitLab's labels are", () => {
    expect(deliverablesFromLabels(["deliverable::code"])).toEqual([])
  })
})

describe("isPublicEpic", () => {
  // The token can read confidential epics, and confidential is the channel
  // the deliverables bot is triggered on. Anything that isn't an explicit
  // `false` is treated as confidential.
  test("only an explicit false is public", () => {
    expect(isPublicEpic({ confidential: false })).toBe(true)
    expect(isPublicEpic({ confidential: true })).toBe(false)
  })

  test("a missing field is confidential, not public", () => {
    expect(isPublicEpic({})).toBe(false)
  })

  test("a non-boolean is confidential", () => {
    expect(isPublicEpic({ confidential: "false" })).toBe(false)
    expect(isPublicEpic({ confidential: 0 })).toBe(false)
    expect(isPublicEpic({ confidential: null })).toBe(false)
  })
})

describe("readEpic", () => {
  test("reads a well-formed epic", () => {
    expect(readEpic(raw())).toEqual({
      iid: 4,
      title: "Link budget rework",
      description: "Re-run the budget against the new antenna.",
      webUrl: "https://gitlab.winlab.tw/groups/winlab/tasa-satsim/-/epics/4",
    })
  })

  test("drops a confidential epic", () => {
    expect(readEpic(raw({ confidential: true }))).toBeNull()
  })

  test("an empty description reads as absent, not as an empty agenda", () => {
    expect(readEpic(raw({ description: "   " }))?.description).toBeNull()
    expect(readEpic(raw({ description: null }))?.description).toBeNull()
  })

  // One odd row shouldn't take the whole picker down.
  test("drops a row with no usable identity", () => {
    expect(readEpic(raw({ iid: 0 }))).toBeNull()
    expect(readEpic(raw({ iid: "abc" }))).toBeNull()
    expect(readEpic(raw({ title: "  " }))).toBeNull()
  })

  // The epic is the meeting; it owes nothing itself. Reading its own labels
  // is the mistake this shape exists to prevent.
  test("reports no deliverables of its own, whatever it is labelled", () => {
    expect(readEpic(raw({ labels: ["Deliverable::Demo"] }))).not.toHaveProperty(
      "deliverables"
    )
  })
})

describe("readEpics", () => {
  test("keeps the readable ones and drops the rest", () => {
    const epics = readEpics([
      raw(),
      raw({ iid: 5, confidential: true }),
      raw({ iid: 6, title: "Ground station" }),
      "not an epic",
    ])
    expect(epics.map((e) => e.iid)).toEqual([4, 6])
  })

  test("a non-array response is no epics, not a crash", () => {
    expect(readEpics(null)).toEqual([])
    expect(readEpics({ message: "403 Forbidden" })).toEqual([])
  })
})

describe("deliverablesFromIssues", () => {
  const issue = (labels: unknown) => ({ labels })

  // What the meeting owes lives on the issues linked under its epic, so this
  // is a union across all of them rather than a read of any single one.
  test("unions the deliverable labels across linked issues", () => {
    expect(
      deliverablesFromIssues([
        issue(["Deliverable::Report", "workflow::doing"]),
        issue(["Deliverable::Presentation"]),
      ])
    ).toEqual(["Deliverable::Presentation", "Deliverable::Report"])
  })

  test("de-duplicates when two issues owe the same thing", () => {
    expect(
      deliverablesFromIssues([
        issue(["Deliverable::Code"]),
        issue(["Deliverable::Code"]),
      ])
    ).toEqual(["Deliverable::Code"])
  })

  // An epic whose issues carry no deliverable labels is a meeting that owes
  // nothing — the same answer as having no epic, reached honestly.
  test("an epic whose issues owe nothing reports nothing", () => {
    expect(
      deliverablesFromIssues([issue(["workflow::doing"]), issue([])])
    ).toEqual([])
    expect(deliverablesFromIssues([])).toEqual([])
  })

  // Unlike the picker this does NOT skip confidential issues: it reads only
  // which of four fixed public label values appear, and names no issue.
  // Skipping them would drop a real deliverable from the meeting's summary.
  test("counts a confidential issue's deliverable without naming it", () => {
    expect(
      deliverablesFromIssues([
        { confidential: true, title: "secret", labels: ["Deliverable::Demo"] },
      ])
    ).toEqual(["Deliverable::Demo"])
  })

  test("survives rows that aren't shaped like issues", () => {
    expect(deliverablesFromIssues(null)).toEqual([])
    expect(deliverablesFromIssues({ message: "403 Forbidden" })).toEqual([])
    expect(
      deliverablesFromIssues([null, "nope", issue("Deliverable::Code")])
    ).toEqual([])
    expect(
      deliverablesFromIssues([issue([1, null, "Deliverable::Code"])])
    ).toEqual(["Deliverable::Code"])
  })
})
