import { describe, expect, test } from "bun:test"

import { resolvePresenterNameOnSave } from "./presenter-save"

describe("resolvePresenterNameOnSave", () => {
  // The data-loss bug commit 69cbe3f fixed: saving a meeting UNCHANGED,
  // whose stored presenter has since been filtered out of the roster (e.g.
  // graduated), must not null the presenter name just because the lookup
  // misses.
  test("keeps the stored name when the presenter is unchanged but filtered out of the roster", () => {
    const result = resolvePresenterNameOnSave({
      presenterUserId: "u1",
      selectedName: undefined,
      meetingPresenterUserId: "u1",
      meetingPresenter: "舊報告人",
    })
    expect(result).toBe("舊報告人")
  })

  test("writes the new name when switched to a different, selectable presenter", () => {
    const result = resolvePresenterNameOnSave({
      presenterUserId: "u2",
      selectedName: "新報告人",
      meetingPresenterUserId: "u1",
      meetingPresenter: "舊報告人",
    })
    expect(result).toBe("新報告人")
  })

  test("yields null when set to __none__", () => {
    const result = resolvePresenterNameOnSave({
      presenterUserId: "__none__",
      selectedName: undefined,
      meetingPresenterUserId: "u1",
      meetingPresenter: "舊報告人",
    })
    expect(result).toBeNull()
  })
})
