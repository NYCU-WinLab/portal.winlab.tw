// What a meeting is expected to produce.
//
// These are GitLab's scoped labels (`Deliverable::*` on group 281, inherited
// everywhere), so the strings belong to GitLab's vocabulary rather than
// Portal's. They're hardcoded rather than fetched because the set is static
// and identical for every project — a token and a round trip to learn four
// constants would be worse than a list that has to be kept in step.
//
// The list is validated server-side before anything is stored or forwarded.
// A value that reaches the pipeline becomes a label on a real issue, so
// "whatever the client sent" is not an acceptable input.

export const DELIVERABLES = [
  {
    value: "Deliverable::Presentation",
    label: "投影片",
    hint: "放到該群組 Nextcloud 的 Reports 資料夾",
  },
  {
    value: "Deliverable::Report",
    label: "報告",
    hint: "以主題命名的 wiki 頁面",
  },
  {
    value: "Deliverable::Code",
    label: "程式",
    hint: "稽核 bot 看的是 commit 活動",
  },
  {
    value: "Deliverable::Demo",
    label: "Demo",
    hint: "",
  },
] as const

export type Deliverable = (typeof DELIVERABLES)[number]["value"]

const KNOWN = new Set<string>(DELIVERABLES.map((d) => d.value))

/**
 * The valid deliverables in a caller's list, de-duplicated and in the
 * canonical order.
 *
 * Unknown values are dropped rather than passed through: they'd end up as
 * labels on a GitLab issue, and an arbitrary string arriving from a browser
 * has no business becoming one. Order is normalised so two bookings with the
 * same choices store the same array.
 */
export function sanitizeDeliverables(input: readonly string[]): Deliverable[] {
  const chosen = new Set(input.filter((v) => KNOWN.has(v)))
  return DELIVERABLES.map((d) => d.value).filter((v) =>
    chosen.has(v)
  ) as Deliverable[]
}

/**
 * The pipeline variable's format: comma-separated, which is how GitLab's own
 * API takes a label list.
 */
export function deliverablesParam(values: readonly string[]): string {
  return sanitizeDeliverables(values).join(",")
}
