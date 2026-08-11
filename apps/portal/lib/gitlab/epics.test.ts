import { describe, expect, test } from "bun:test"

import {
  deliverablesFromLabels,
  deliverablesOf,
  readEpic,
  readEpicIssues,
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

describe("readEpic", () => {
  test("reads a well-formed epic", () => {
    expect(readEpic(raw())).toEqual({
      iid: 4,
      title: "Link budget rework",
      description: "Re-run the budget against the new antenna.",
      webUrl: "https://gitlab.winlab.tw/groups/winlab/tasa-satsim/-/epics/4",
    })
  })

  // `confidential` is the deliverables bot's trigger channel here, not a
  // secrecy marker, so filtering on it hid ordinary work from the people
  // whose meeting it is.
  test("keeps a confidential epic — the flag isn't about secrecy", () => {
    expect(readEpic(raw({ confidential: true }))?.iid).toBe(4)
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
    expect(epics.map((e) => e.iid)).toEqual([4, 5, 6])
  })

  test("a non-array response is no epics, not a crash", () => {
    expect(readEpics(null)).toEqual([])
    expect(readEpics({ message: "403 Forbidden" })).toEqual([])
  })
})

describe("readEpicIssues", () => {
  const issue = (labels: unknown, extra: Record<string, unknown> = {}) => ({
    labels,
    title: "月會進度報告 (2026-08) - 簡報",
    confidential: false,
    ...extra,
  })

  test("keeps the issues that owe something, with their titles", () => {
    expect(
      readEpicIssues([issue(["Deliverable::Report", "workflow::doing"])])
    ).toEqual([
      {
        title: "月會進度報告 (2026-08) - 簡報",
        deliverables: ["Deliverable::Report"],
      },
    ])
  })

  // Work under the epic isn't the same as a deliverable of the meeting.
  test("drops issues with no Deliverable label", () => {
    expect(readEpicIssues([issue(["workflow::doing"]), issue([])])).toEqual([])
  })

  test("an issue can owe more than one thing, in canonical order", () => {
    expect(
      readEpicIssues([
        issue(["Deliverable::Demo", "Deliverable::Presentation"]),
      ])[0]!.deliverables
    ).toEqual(["Deliverable::Presentation", "Deliverable::Demo"])
  })

  // Confidential marks the deliverables bot's trigger channel here, not NDA
  // material, so the title reads like any other.
  test("a confidential issue shows its title like any other", () => {
    expect(
      readEpicIssues([
        issue(["Deliverable::Demo"], { confidential: true, title: "月會簡報" }),
      ])
    ).toEqual([{ title: "月會簡報", deliverables: ["Deliverable::Demo"] }])
  })

  test("a title is null only when GitLab sent nothing usable", () => {
    expect(
      readEpicIssues([issue(["Deliverable::Code"], { title: "  " })])[0]!.title
    ).toBeNull()
    expect(
      readEpicIssues([{ labels: ["Deliverable::Code"] }])[0]!.title
    ).toBeNull()
  })

  test("survives rows that aren't shaped like issues", () => {
    expect(readEpicIssues(null)).toEqual([])
    expect(readEpicIssues({ message: "403 Forbidden" })).toEqual([])
    expect(readEpicIssues([null, "nope"])).toEqual([])
    expect(
      readEpicIssues([issue([1, null, "Deliverable::Code"])])[0]!.deliverables
    ).toEqual(["Deliverable::Code"])
  })
})

describe("deliverablesOf", () => {
  test("unions across issues, de-duplicated and canonical", () => {
    expect(
      deliverablesOf([
        { title: "a", deliverables: ["Deliverable::Demo"] },
        { title: "b", deliverables: ["Deliverable::Presentation"] },
        { title: "c", deliverables: ["Deliverable::Demo"] },
      ])
    ).toEqual(["Deliverable::Presentation", "Deliverable::Demo"])
  })

  test("nothing in, nothing out", () => {
    expect(deliverablesOf([])).toEqual([])
  })
})
