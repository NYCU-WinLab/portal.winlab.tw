import { describe, expect, test } from "bun:test"
import { toast } from "sonner"

import { settleRemovalToast } from "./batch-progress"

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
