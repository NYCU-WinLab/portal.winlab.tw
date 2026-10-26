import { describe, expect, test } from "bun:test"
import { toast } from "sonner"

import { jobView, newJob, type BatchJob } from "@/lib/groups/progress"

import { settleRemovalToast, showBatchToast } from "./batch-progress"

// What the Toaster shows for an id: sonner's history keeps one entry per
// call, and the Toaster merges each into the toast already on screen.
const shown = (id: string | number) =>
  Object.assign({}, ...toast.getHistory().filter((t) => t.id === id))

describe("settleRemovalToast", () => {
  // A loading toast never closes, has no ✕ and can't be swiped away, so
  // every ending has to leave that type behind.
  for (const tone of ["success", "gone", "failure"] as const)
    test(`a ${tone} ending replaces the loading toast`, () => {
      const id = toast.loading("正在移除 x@x.org")
      settleRemovalToast(id, "lab-all@winlab.tw", tone, "done")
      expect(shown(id).type).not.toBe("loading")
      expect(shown(id).title).toBe("done")
    })
})

describe("showBatchToast", () => {
  const start = (id: number): BatchJob =>
    newJob(id, {
      groupId: "g",
      groupEmail: "lab-all@winlab.tw",
      emails: ["a@x.org", "b@x.org"],
    })
  const endings = {
    success: (j: BatchJob): BatchJob => ({
      ...j,
      dispatched: 2,
      added: 2,
      done: true,
    }),
    failure: (j: BatchJob): BatchJob => ({
      ...j,
      dispatched: 2,
      added: 1,
      unknown: ["b@x.org"],
      done: true,
    }),
  }

  // Same reason as above: a batch's toast loads while it runs, and its
  // ending has to replace that or the toast stays for good.
  let nextId = 9000
  for (const tone of ["success", "failure"] as const)
    test(`a ${tone} ending replaces the running toast`, () => {
      const running = start(nextId++)
      const id = `groups-batch-${running.id}`
      showBatchToast(running, jobView(running, [running]), () => {})
      expect(shown(id).type).toBe("loading")
      const end = endings[tone](running)
      const view = jobView(end, [end])
      expect(view.tone).toBe(tone)
      showBatchToast(end, view, () => {})
      expect(shown(id).type).not.toBe("loading")
    })
})
