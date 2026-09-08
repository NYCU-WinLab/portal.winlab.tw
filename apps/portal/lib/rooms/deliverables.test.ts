import { describe, expect, test } from "bun:test"

import {
  DELIVERABLES,
  deliverablesParam,
  sanitizeDeliverables,
} from "./deliverables"

describe("DELIVERABLES", () => {
  // The four scoped labels on GitLab group 281. Pinned because they're a
  // shared vocabulary — a typo here becomes a label that matches nothing.
  test("is exactly the four GitLab labels", () => {
    expect(DELIVERABLES.map((d) => d.value)).toEqual([
      "Deliverable::Presentation",
      "Deliverable::Report",
      "Deliverable::Code",
      "Deliverable::Demo",
    ])
  })
})

describe("sanitizeDeliverables", () => {
  test("keeps known values", () => {
    expect(sanitizeDeliverables(["Deliverable::Code"])).toEqual([
      "Deliverable::Code",
    ])
  })

  // These end up as labels on a real issue, so an arbitrary string from a
  // browser must not survive the trip.
  test("drops anything not on the list", () => {
    expect(
      sanitizeDeliverables([
        "Deliverable::Code",
        "Deliverable::Nonsense",
        "critical",
        "",
      ])
    ).toEqual(["Deliverable::Code"])
  })

  test("is case-sensitive — GitLab's labels are", () => {
    expect(sanitizeDeliverables(["deliverable::code"])).toEqual([])
  })

  test("de-duplicates", () => {
    expect(
      sanitizeDeliverables(["Deliverable::Demo", "Deliverable::Demo"])
    ).toEqual(["Deliverable::Demo"])
  })

  // Two bookings with the same choices should store the same array, whatever
  // order the checkboxes were clicked in.
  test("normalises to the canonical order", () => {
    expect(
      sanitizeDeliverables(["Deliverable::Demo", "Deliverable::Presentation"])
    ).toEqual(["Deliverable::Presentation", "Deliverable::Demo"])
  })

  test("empty in, empty out", () => {
    expect(sanitizeDeliverables([])).toEqual([])
  })
})

describe("deliverablesParam", () => {
  test("comma-separated, the shape GitLab's label API takes", () => {
    expect(
      deliverablesParam(["Deliverable::Code", "Deliverable::Report"])
    ).toBe("Deliverable::Report,Deliverable::Code")
  })

  test("an empty selection is an empty string, not a stray comma", () => {
    expect(deliverablesParam([])).toBe("")
    expect(deliverablesParam(["nope"])).toBe("")
  })
})
