import { describe, expect, test } from "bun:test"

import {
  applyPending,
  cohortCandidates,
  cohortContribution,
  externalAddresses,
  isPlainMember,
  nextPollStep,
  NO_OVERLAY,
  NO_PENDING,
  onFreshList,
  onRetriesExhausted,
  overlayAdded,
  overlayGiveUp,
  overlayOnList,
  overlayRemoved,
  overlayRetry,
  planAdditions,
  POLL_IDLE,
  pollCompleted,
  pollGaveUp,
  pollIssued,
  pollNewWindow,
  prunePending,
  withAdded,
  withRemoved,
  type PollState,
} from "@/lib/groups/plan"
import type { GroupMember } from "@/lib/groups/types"

const member = (email: string, role = "MEMBER"): GroupMember => ({
  id: `id-${email}`,
  email,
  role,
  type: "USER",
  status: null,
})

describe("planAdditions", () => {
  test("splits candidates into new and already-present, case-insensitively", () => {
    expect(
      planAdditions(
        ["New@x.com", "old@x.com", "new@x.com"],
        ["OLD@x.com", "other@x.com"]
      )
    ).toEqual({ toAdd: ["new@x.com"], already: ["old@x.com"] })
  })
})

describe("externalAddresses", () => {
  test("anything not exactly in the domain is external", () => {
    expect(
      externalAddresses(
        ["a@winlab.tw", "b@gmail.com", "c@sub.winlab.tw", "D@WINLAB.TW"],
        "winlab.tw"
      )
    ).toEqual(["b@gmail.com", "c@sub.winlab.tw"])
  })
})

describe("cohortCandidates", () => {
  const members = [
    { id: "1", email: "A@x.com", name: "A", username: "a" },
    { id: "2", email: null, name: "B", username: "b" },
    { id: "3", email: "c@x.com", name: "C", username: "c" },
    { id: "4", email: "d@x.com", name: "D", username: "d" },
  ]
  const status = new Map<string, string | null>([
    ["a@x.com", "master"],
    ["c@x.com", "alumni"],
  ])

  test("excludes known alumni and members without an email", () => {
    expect(cohortCandidates(members, status, { excludeAlumni: true })).toEqual({
      emails: ["a@x.com", "d@x.com"],
      skippedNoEmail: 1,
      skippedAlumni: 1,
      unknownStatus: 1,
    })
  })

  test("counts kept members whose status is unknown", () => {
    const r = cohortCandidates(members, status, { excludeAlumni: true })
    expect(r.unknownStatus).toBe(1) // d@x.com has no profile
  })

  test("a profile with a null lab_status counts as unknown too", () => {
    const withNull = new Map<string, string | null>([
      ...status,
      ["d@x.com", null],
    ])
    const r = cohortCandidates(members, withNull, { excludeAlumni: true })
    expect(r.emails).toContain("d@x.com")
    expect(r.unknownStatus).toBe(1)
  })

  test("keeps alumni when asked to", () => {
    expect(
      cohortCandidates(members, status, { excludeAlumni: false }).emails
    ).toEqual(["a@x.com", "c@x.com", "d@x.com"])
  })
})

describe("isPlainMember", () => {
  test("only the MEMBER role is plain", () => {
    expect(isPlainMember("MEMBER")).toBe(true)
    expect(isPlainMember("MANAGER")).toBe(false)
    expect(isPlainMember("OWNER")).toBe(false)
    expect(isPlainMember("member")).toBe(false)
    expect(isPlainMember(null)).toBe(false)
    expect(isPlainMember(undefined)).toBe(false)
  })
})

describe("pending changes (Google's list is eventually consistent)", () => {
  test("an address just added shows as pending until Google lists it", () => {
    const pending = withAdded(NO_PENDING, ["New@x.com"])
    expect(applyPending([member("a@x.com")], pending)).toEqual([
      { ...member("a@x.com"), pending: false },
      {
        id: null,
        email: "new@x.com",
        role: "MEMBER",
        type: null,
        status: null,
        pending: true,
      },
    ])
    expect(
      applyPending([member("a@x.com"), member("new@x.com")], pending)
    ).toEqual([
      { ...member("a@x.com"), pending: false },
      { ...member("new@x.com"), pending: false },
    ])
  })

  test("an address just removed is hidden even if Google still lists it", () => {
    const pending = withRemoved(NO_PENDING, "A@x.com")
    expect(
      applyPending([member("a@x.com"), member("b@x.com")], pending)
    ).toEqual([{ ...member("b@x.com"), pending: false }])
  })

  test("adding and removing the same address cancel out", () => {
    const p = withRemoved(withAdded(NO_PENDING, ["a@x.com"]), "a@x.com")
    expect(p).toEqual({ added: [], removed: ["a@x.com"] })
    expect(withAdded(p, ["a@x.com"])).toEqual({
      added: ["a@x.com"],
      removed: [],
    })
  })

  test("prunePending drops what Google has caught up with, and keeps the rest", () => {
    const p = {
      added: ["new@x.com", "slow@x.com"],
      removed: ["gone@x.com", "lag@x.com"],
    }
    expect(prunePending([member("new@x.com"), member("lag@x.com")], p)).toEqual(
      { added: ["slow@x.com"], removed: ["lag@x.com"] }
    )
  })

  test("prunePending returns the same object when nothing settled", () => {
    const p = { added: ["slow@x.com"], removed: [] }
    expect(prunePending([member("a@x.com")], p)).toBe(p)
  })
})

describe("giving up on the overlay", () => {
  test("a good list on screen: the overlay is cleared when retries run out", () => {
    expect(onRetriesExhausted(false)).toBe("clear")
  })

  test("a stale list on screen: the give-up is deferred, not applied", () => {
    expect(onRetriesExhausted(true)).toBe("defer")
  })

  const p = { added: ["slow@x.com", "new@x.com"], removed: ["lag@x.com"] }
  const list = [member("new@x.com"), member("lag@x.com")]

  test("without a deferral a fresh list only prunes what it agrees with", () => {
    expect(
      onFreshList(list, p, { giveUpDeferred: false, stale: false })
    ).toEqual({ added: ["slow@x.com"], removed: ["lag@x.com"] })
  })

  test("after a deferral the first good list drops the rest as well", () => {
    expect(onFreshList(list, p, { giveUpDeferred: true, stale: false })).toBe(
      NO_PENDING
    )
  })

  test("after a deferral a list that is still stale only prunes", () => {
    expect(onFreshList(list, p, { giveUpDeferred: true, stale: true })).toEqual(
      { added: ["slow@x.com"], removed: ["lag@x.com"] }
    )
  })
})

describe("cohortContribution", () => {
  const members = [
    { id: "1", email: "a@x.org" },
    { id: "2", email: "old@x.org" },
  ] as unknown as Parameters<typeof cohortCandidates>[0]
  const status = new Map([["old@x.org", "alumni"]])

  test("contributes nothing when profiles could not be read", () => {
    expect(
      cohortContribution(members, new Map(), {
        excludeAlumni: true,
        profilesLoaded: false,
      }).emails
    ).toEqual([])
  })
  test("excludes alumni when profiles loaded", () => {
    expect(
      cohortContribution(members, status, {
        excludeAlumni: true,
        profilesLoaded: true,
      }).emails
    ).toEqual(["a@x.org"])
  })
  test("no cohort selected contributes nothing", () => {
    expect(
      cohortContribution(undefined, status, {
        excludeAlumni: true,
        profilesLoaded: true,
      }).emails
    ).toEqual([])
  })
})

describe("the overlay across actions", () => {
  test("a new add after a deferred give-up stays pending through the next good read", () => {
    // Retries ran out while the list was stale: the overlay was kept.
    let o = overlayAdded(NO_OVERLAY, ["old@x.com"])
    o = overlayGiveUp(o, true)
    expect(o.giveUpDeferred).toBe(true)
    // A new add starts a fresh window...
    o = overlayAdded(o, ["new@x.com"])
    expect(o.giveUpDeferred).toBe(false)
    // ...so a good read that doesn't list it yet only prunes.
    o = overlayOnList(o, [member("old@x.com")], false)
    expect(o.pending).toEqual({ added: ["new@x.com"], removed: [] })
  })

  test("a removal or an uncertain outcome also resets a deferral", () => {
    const deferred = overlayGiveUp(overlayAdded(NO_OVERLAY, ["a@x.com"]), true)
    expect(overlayRemoved(deferred, "b@x.com").giveUpDeferred).toBe(false)
    expect(overlayRetry(deferred)).toEqual({
      pending: deferred.pending,
      giveUpDeferred: false,
    })
  })

  test("without a new action the first good read after a deferral clears the rest", () => {
    const deferred = overlayGiveUp(overlayAdded(NO_OVERLAY, ["a@x.com"]), true)
    expect(overlayOnList(deferred, [], false)).toEqual(NO_OVERLAY)
  })

  test("a stale read keeps the deferral and only prunes", () => {
    const deferred = overlayGiveUp(
      overlayAdded(NO_OVERLAY, ["a@x.com", "b@x.com"]),
      true
    )
    expect(overlayOnList(deferred, [member("a@x.com")], true)).toEqual({
      pending: { added: ["b@x.com"], removed: [] },
      giveUpDeferred: true,
    })
  })

  test("giving up on a good list clears the overlay", () => {
    const o = overlayAdded(NO_OVERLAY, ["a@x.com"])
    expect(overlayGiveUp(o, false)).toEqual(NO_OVERLAY)
  })
})

describe("re-read polling", () => {
  const READS = 3
  const at = (s: PollState, settled: boolean, stale = false) =>
    nextPollStep(s, { settled, stale, reads: READS })
  // n reads issued and completed in the current window.
  const afterReads = (s: PollState, n: number) => {
    for (let i = 0; i < n; i++) s = pollCompleted(pollIssued(s))
    return s
  }
  const started = pollNewWindow(POLL_IDLE, { forcedReads: 0 })

  test("re-reads while the overlay is unsettled", () => {
    expect(at(started, false)).toBe("refresh")
    expect(at(afterReads(started, 2), false)).toBe("refresh")
  })

  test("all reads good: gives up and clears after the last one completed", () => {
    expect(at(afterReads(started, 3), false)).toBe("give-up-clear")
  })

  test("last read stale: gives up by deferring", () => {
    expect(at(afterReads(started, 3), false, true)).toBe("give-up-defer")
  })

  test("a read still in flight is waited for, never counted or given up on", () => {
    const issued = pollIssued(afterReads(started, 2))
    expect(issued.readsDone).toBe(2)
    expect(at(issued, false)).toBe("wait")
    expect(at(issued, false, true)).toBe("wait")
    expect(at(issued, true)).toBe("wait")
    // Only its completion counts, and only then is the give-up decided.
    expect(at(pollCompleted(issued), false)).toBe("give-up-clear")
  })

  test("settled early: stops without reading or giving up", () => {
    expect(at(afterReads(started, 1), true)).toBe("stop")
  })

  test("an uncertain outcome keeps reading while settled, then stops", () => {
    const forced = pollNewWindow(POLL_IDLE, { forcedReads: 3 })
    expect(at(forced, true)).toBe("refresh")
    expect(at(afterReads(forced, 2), true)).toBe("refresh")
    expect(at(afterReads(forced, 3), true)).toBe("stop")
  })

  test("a new action restarts the count", () => {
    const again = pollNewWindow(afterReads(started, 3), { forcedReads: 0 })
    expect(again.readsDone).toBe(0)
    expect(at(again, false)).toBe("refresh")
  })

  test("a read issued before a new action doesn't count toward the new window", () => {
    const inFlight = pollIssued(afterReads(started, 2))
    const again = pollNewWindow(inFlight, { forcedReads: 0 })
    expect(at(again, false)).toBe("wait")
    const done = pollCompleted(again)
    expect(done.readsDone).toBe(0)
    expect(done.inFlight).toBeNull()
    expect(at(done, false)).toBe("refresh")
  })

  test("a new action keeps reads still owed to an uncertain outcome", () => {
    const owed = pollNewWindow(POLL_IDLE, { forcedReads: 3 })
    expect(pollNewWindow(owed, { forcedReads: 0 }).forcedReads).toBe(3)
  })

  test("giving up drops reads still owed", () => {
    const owed = pollNewWindow(POLL_IDLE, { forcedReads: 3 })
    expect(pollGaveUp(owed).forcedReads).toBe(0)
  })
})
