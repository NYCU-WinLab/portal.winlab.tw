import { describe, expect, test } from "bun:test"

import { PHASE_LABEL } from "@/lib/gallery/upload-pipeline"
import type { CompressPhase } from "@/lib/gallery/video-compress"

describe("PHASE_LABEL", () => {
  test("covers every CompressPhase", () => {
    const phases: CompressPhase[] = ["init", "probe", "compress", "poster"]
    for (const phase of phases) {
      expect(PHASE_LABEL[phase].length).toBeGreaterThan(0)
    }
    expect(Object.keys(PHASE_LABEL).sort()).toEqual([...phases].sort())
  })
})
