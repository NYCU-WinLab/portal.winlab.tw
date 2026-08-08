import { describe, expect, test } from "bun:test"

import {
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
    labels: ["Deliverable::Report", "workflow::doing"],
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
      deliverables: ["Deliverable::Report"],
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

  test("survives labels arriving as something other than strings", () => {
    expect(readEpic(raw({ labels: [1, null, "Deliverable::Demo"] }))).toEqual({
      iid: 4,
      title: "Link budget rework",
      description: "Re-run the budget against the new antenna.",
      deliverables: ["Deliverable::Demo"],
      webUrl: "https://gitlab.winlab.tw/groups/winlab/tasa-satsim/-/epics/4",
    })
    expect(
      readEpic(raw({ labels: "Deliverable::Demo" }))?.deliverables
    ).toEqual([])
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
