import { describe, expect, test } from "bun:test"

import { pickRecording, recordingPrefix } from "./recording-match"

function file(filename: string) {
  return { filename, href: `/dav/${filename}`, fileId: filename }
}

describe("recordingPrefix", () => {
  test("reads the bridge's space-separated convention", () => {
    expect(recordingPrefix("[tasa-satsim] 2026-08-18 週會.mp4")).toBe(
      "tasa-satsim"
    )
  })

  test("also reads the hyphen form", () => {
    expect(recordingPrefix("[tasa-satsim]-2026-08-18-週會.mp4")).toBe(
      "tasa-satsim"
    )
  })

  // The lab's own naming since 2023 — 44 recordings' worth. It must keep
  // reading as "no project", not as a broken prefix.
  test("legacy names have no prefix", () => {
    expect(recordingPrefix("2026-06-22 Hermes Agent - 進度.mp4")).toBeNull()
  })

  test("a bracket that isn't a prefix doesn't count", () => {
    // No separator after the closing bracket.
    expect(recordingPrefix("[draft]2026-08-18.mp4")).toBeNull()
    expect(recordingPrefix("2026-08-18 [備份] 週會.mp4")).toBeNull()
  })
})

describe("pickRecording", () => {
  const seminar = file("2026-08-18 Hermes Agent - 進度.mp4")
  const tasa = file("[tasa-satsim] 2026-08-18 週會.mp4")
  const cht = file("[cht-intent-vpn] 2026-08-18 討論.mp4")
  const otherDay = file("[tasa-satsim] 2026-08-19 週會.mp4")

  test("returns null when nothing is on that date", () => {
    expect(pickRecording([otherDay], { date: "2026-08-18" })).toBeNull()
  })

  // The bug: three meetings on one day, and whoever asked got the first file
  // in the listing regardless of whose meeting it was.
  test("a prefixed request gets its own project's recording", () => {
    const hit = pickRecording([seminar, tasa, cht], {
      date: "2026-08-18",
      prefix: "cht-intent-vpn",
    })
    expect(hit?.filename).toBe(cht.filename)
  })

  test("a prefixed request gets nothing rather than someone else's video", () => {
    expect(
      pickRecording([seminar, tasa], {
        date: "2026-08-18",
        prefix: "cht-intent-vpn",
      })
    ).toBeNull()
  })

  // The weekly seminar has no project, so it must not start claiming a room
  // booking's recording the first day the two land together.
  test("an unprefixed request prefers the unprefixed file", () => {
    const hit = pickRecording([tasa, seminar, cht], { date: "2026-08-18" })
    expect(hit?.filename).toBe(seminar.filename)
  })

  test("an unprefixed request still finds something when only prefixed files exist", () => {
    const hit = pickRecording([tasa], { date: "2026-08-18" })
    expect(hit?.filename).toBe(tasa.filename)
  })

  test("matches the compact date spelling too", () => {
    const compact = file("[tasa-satsim] 20260818 週會.mp4")
    expect(
      pickRecording([compact], { date: "2026-08-18", prefix: "tasa-satsim" })
        ?.filename
    ).toBe(compact.filename)
  })

  test("carries the caller's fields through", () => {
    const hit = pickRecording([tasa], {
      date: "2026-08-18",
      prefix: "tasa-satsim",
    })
    expect(hit?.href).toBe(tasa.href)
    expect(hit?.fileId).toBe(tasa.fileId)
    expect(hit?.prefix).toBe("tasa-satsim")
  })
})
