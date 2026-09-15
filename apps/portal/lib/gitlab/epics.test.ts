import { describe, expect, test } from "bun:test"

import {
  agendaAfterEpicSelection,
  deliverablesFromLabels,
  deliverablesOf,
  epicIssuesPath,
  groupIterationsPath,
  readEpic,
  readEpicIssues,
  readEpics,
  readReviewIssues,
  reportIssuesQuery,
} from "./epics"

function raw(overrides: Record<string, unknown> = {}) {
  return {
    id: 104,
    iid: 4,
    title: "Link budget rework",
    description: "Re-run the budget against the new antenna.",
    web_url: "https://gitlab.winlab.tw/groups/winlab/tasa-satsim/-/epics/4",
    labels: ["Meeting::Track"],
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
      id: 104,
      iid: 4,
      title: "Link budget rework",
      description: "Re-run the budget against the new antenna.",
      webUrl: "https://gitlab.winlab.tw/groups/winlab/tasa-satsim/-/epics/4",
      classification: "meeting",
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
    expect(readEpic(raw({ id: 0 }))).toBeNull()
    expect(readEpic(raw({ iid: 0 }))).toBeNull()
    expect(readEpic(raw({ iid: "abc" }))).toBeNull()
    expect(readEpic(raw({ title: "  " }))).toBeNull()
    expect(readEpic(raw({ iid: true }))).toBeNull()
  })

  test("classifies an epic without Meeting::Track as a Sync container", () => {
    expect(readEpic(raw({ labels: [] }))).toMatchObject({
      classification: "sync",
    })
  })

  test("reads an explicit numeric Report iteration", () => {
    expect(
      readEpic(
        raw({
          description: 'Delivery review\n<!-- winlab:review iteration="10" -->',
        })
      )
    ).toMatchObject({
      classification: "report",
      reviewIterationId: 10,
    })
  })

  test("surfaces a malformed Report marker instead of guessing", () => {
    const epic = readEpic(
      raw({ description: '<!-- winlab:review iteration="next" -->' })
    )
    expect(epic?.classification).toBe("report")
    expect(epic?.reviewIterationId).toBeUndefined()
    expect(epic?.reviewMarkerError).toContain("正整數")
    expect(
      readEpic(raw({ description: "<!-- winlab:review -->" }))
        ?.reviewMarkerError
    ).toContain("iteration")
  })

  test("does not treat a generated review snapshot as configuration", () => {
    const epic = readEpic(
      raw({
        description:
          "<!-- winlab:review-snapshot -->\nGenerated review content",
      })
    )
    expect(epic?.classification).toBe("meeting")
    expect(epic).not.toHaveProperty("reviewIterationId")
  })

  test("finds the config marker after a generated snapshot", () => {
    expect(
      readEpic(
        raw({
          description:
            '<!-- winlab:review-snapshot -->\nGenerated\n<!-- winlab:review iteration="10" -->',
        })
      )
    ).toMatchObject({
      classification: "report",
      reviewIterationId: 10,
    })
  })

  test("rejects duplicate or noncanonical iteration settings like the helper", () => {
    for (const description of [
      '<!-- winlab:review iteration="10" -->\n<!-- winlab:review iteration="11" -->',
      '<!-- winlab:review iteration="10" iteration="11" -->',
      '<!-- winlab:review iteration="010" -->',
      '<!-- winlab:review iteration="9007199254740993" -->',
    ]) {
      const epic = readEpic(raw({ description }))
      expect(epic?.classification).toBe("report")
      expect(epic?.reviewIterationId).toBeUndefined()
      expect(epic?.reviewMarkerError).toBeDefined()
    }
  })

  test("uses the helper's case-sensitive marker contract", () => {
    expect(
      readEpic(raw({ description: '<!-- WINLAB:REVIEW iteration="10" -->' }))
        ?.classification
    ).toBe("meeting")
    expect(
      readEpic(raw({ description: '<!-- winlab:review Iteration="10" -->' }))
        ?.reviewMarkerError
    ).toBeDefined()
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
        webUrl: null,
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
    ).toEqual([
      {
        title: "月會簡報",
        webUrl: null,
        deliverables: ["Deliverable::Demo"],
      },
    ])
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

describe("readReviewIssues", () => {
  test("keeps every issue in the iteration and exposes its GitLab link", () => {
    expect(
      readReviewIssues([
        {
          title: "Ship radio firmware",
          web_url: "https://gitlab.winlab.tw/winlab/radio/-/issues/8",
          labels: ["workflow::doing"],
        },
      ])
    ).toEqual([
      {
        title: "Ship radio firmware",
        webUrl: "https://gitlab.winlab.tw/winlab/radio/-/issues/8",
        deliverables: [],
      },
    ])
  })

  test("keeps malformed iteration rows harmless", () => {
    expect(readReviewIssues([null, "nope"])).toEqual([])
  })
})

test("epic association query uses its iid and paginates", () => {
  const epic = readEpic(raw())!
  expect(epicIssuesPath("winlab/radio", epic.iid, 2)).toBe(
    "/groups/winlab%2Fradio/epics/4/issues?per_page=100&page=2"
  )
})

test("Report validation includes ancestor iterations and all states", () => {
  expect(groupIterationsPath("winlab/radio", 2)).toBe(
    "/groups/winlab%2Fradio/iterations?include_ancestors=true&state=all&per_page=100&page=2"
  )
})

test("Report issue query pins iteration, descendants, and page", () => {
  const query = new URLSearchParams(reportIssuesQuery(10, 3))
  expect(query.get("iteration_id")).toBe("10")
  expect(query.get("include_subgroups")).toBe("true")
  expect(query.get("scope")).toBe("all")
  expect(query.get("state")).toBe("all")
  expect(query.get("per_page")).toBe("100")
  expect(query.get("page")).toBe("3")
})

describe("agendaAfterEpicSelection", () => {
  const epic = (classification: "sync" | "report" | "meeting") => ({
    id: 104,
    iid: 4,
    title: "Meeting",
    description: "Administrative epic description",
    webUrl: null,
    classification,
  })

  test("never turns a Sync container description into the child agenda", () => {
    expect(agendaAfterEpicSelection("", epic("sync"))).toBe("")
  })

  test("does not turn a Report snapshot into an agenda", () => {
    expect(agendaAfterEpicSelection("", epic("report"))).toBe("")
  })

  test("pre-fills an ordinary single meeting but preserves typed agenda", () => {
    expect(agendaAfterEpicSelection("", epic("meeting"))).toBe(
      "Administrative epic description"
    )
    expect(agendaAfterEpicSelection("My agenda", epic("meeting"))).toBe(
      "My agenda"
    )
    expect(agendaAfterEpicSelection("My agenda", epic("sync"))).toBe(
      "My agenda"
    )
  })

  test("removes inherited text when switching to a Sync or Report target", () => {
    const previous = epic("meeting")
    expect(
      agendaAfterEpicSelection(previous.description, epic("sync"), previous)
    ).toBe("")
    expect(
      agendaAfterEpicSelection(previous.description, epic("report"), previous)
    ).toBe("")
    expect(agendaAfterEpicSelection(previous.description, null, previous)).toBe(
      ""
    )
    expect(
      agendaAfterEpicSelection("My edited agenda", epic("sync"), previous)
    ).toBe("My edited agenda")
    expect(
      agendaAfterEpicSelection(
        previous.description,
        { ...epic("meeting"), description: null },
        previous
      )
    ).toBe("")
  })
})

describe("deliverablesOf", () => {
  test("unions across issues, de-duplicated and canonical", () => {
    expect(
      deliverablesOf([
        { title: "a", webUrl: null, deliverables: ["Deliverable::Demo"] },
        {
          title: "b",
          webUrl: null,
          deliverables: ["Deliverable::Presentation"],
        },
        { title: "c", webUrl: null, deliverables: ["Deliverable::Demo"] },
      ])
    ).toEqual(["Deliverable::Presentation", "Deliverable::Demo"])
  })

  test("nothing in, nothing out", () => {
    expect(deliverablesOf([])).toEqual([])
  })
})
