// Which GitLab epic a meeting belongs to.
//
// This is the difference between a booking that lands a marker comment on the
// workstream it belongs to and one that spawns a parentless epic somebody has
// to re-file by hand. Every booking sent without it is the second kind.
//
// The consumer accepts almost anything (`&4`, `4`, a full epic URL, a
// comma-separated mix), but "the consumer is lenient" is a reason to normalise
// here, not a reason not to: two bookings pointing at the same epic should
// store the same string, and what we store is also what a person reads back
// out of the feed.
//
// Epics only. An issue reference (`group#12`) is dropped rather than passed
// through or quietly rewritten as an epic — the pipeline's rule is "put the
// marker on that epic", and pointing it at an issue is a different request
// that it has no branch for.

/** `winlab/tasa-satsim&4` — the form GitLab itself prints for an epic. */
export interface EpicRef {
  /** Full group path, e.g. `winlab/network-system-design/tasa-satsim`. */
  groupPath: string
  iid: number
}

// A group path is one or more slash-separated segments; GitLab allows letters,
// digits, and `_.-` in each. Deliberately not anchored to `winlab/` — the
// lab's GitLab nests three levels deep and the depth has already changed once.
const GROUP_PATH =
  "[A-Za-z0-9_][A-Za-z0-9_.-]*(?:/[A-Za-z0-9_][A-Za-z0-9_.-]*)*"

const URL_FORM = new RegExp(`/groups/(${GROUP_PATH})/-/epics/(\\d+)`)
const REFERENCE_FORM = new RegExp(`^(${GROUP_PATH})&(\\d+)$`)
const BARE_FORM = /^&?(\d+)$/

/**
 * Reads one reference in any of the forms a person or a picker might produce.
 *
 * @param fallbackGroupPath used for the bare forms (`4`, `&4`), which name an
 *   iid without saying whose. A bare reference with no group in hand is
 *   unresolvable, so it's rejected rather than guessed at.
 */
export function parseEpicRef(
  input: string,
  fallbackGroupPath?: string | null
): EpicRef | null {
  const value = input.trim()
  if (!value) return null

  const withGroup = URL_FORM.exec(value) ?? REFERENCE_FORM.exec(value)
  if (withGroup?.[1] && withGroup[2]) {
    return { groupPath: withGroup[1], iid: Number(withGroup[2]) }
  }

  const bare = BARE_FORM.exec(value)
  const fallback = fallbackGroupPath?.trim()
  if (bare?.[1] && fallback) {
    return { groupPath: fallback, iid: Number(bare[1]) }
  }

  return null
}

export function formatEpicRef(ref: EpicRef): string {
  return `${ref.groupPath}&${ref.iid}`
}

/**
 * The valid epic references in a caller's list, canonicalised and
 * de-duplicated, in the order they were given.
 *
 * Order is preserved rather than sorted: unlike deliverables, which are a set,
 * the first epic is the one a reader treats as the meeting's home.
 */
export function sanitizeIssueRefs(
  input: readonly string[],
  fallbackGroupPath?: string | null
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const ref = parseEpicRef(raw, fallbackGroupPath)
    if (!ref) continue
    const formatted = formatEpicRef(ref)
    if (seen.has(formatted)) continue
    seen.add(formatted)
    out.push(formatted)
  }
  return out
}

/** The pipeline variable's format — comma-separated, same as DELIVERABLES. */
export function issueRefsParam(refs: readonly string[]): string {
  return refs.join(",")
}
