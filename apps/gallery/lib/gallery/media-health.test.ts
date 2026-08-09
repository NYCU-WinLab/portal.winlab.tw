import { describe, expect, test } from "bun:test"

import {
  buildFinding,
  classifyObjectStatus,
  classifyThumbStatus,
  displayPathForRow,
  issueLabel,
  issuesFromProbes,
  mapWithConcurrency,
  MEDIA_HEALTH_PAGE_SIZE,
  summarizeFindings,
  type MediaHealthFinding,
  type MediaHealthScanRow,
} from "@/lib/gallery/media-health"

const imageRow: MediaHealthScanRow = {
  id: "img-1",
  name: "Lab night",
  image_path: "user/a.jpg",
  media_type: "image",
  poster_path: null,
  created_by: "user-1",
  created_at: "2026-08-01T00:00:00Z",
}

const videoRow: MediaHealthScanRow = {
  id: "vid-1",
  name: "Demo reel",
  image_path: "user/a.mp4",
  media_type: "video",
  poster_path: "user/a-poster.jpg",
  created_by: "user-1",
  created_at: "2026-08-01T00:00:00Z",
}

describe("displayPathForRow", () => {
  test("images use the original path", () => {
    expect(displayPathForRow(imageRow)).toBe("user/a.jpg")
  })

  test("videos prefer the poster for wall thumbs", () => {
    expect(displayPathForRow(videoRow)).toBe("user/a-poster.jpg")
  })

  test("videos without poster fall back to the original path", () => {
    expect(
      displayPathForRow({
        ...videoRow,
        poster_path: null,
      })
    ).toBe("user/a.mp4")
  })
})

describe("classifyObjectStatus", () => {
  test("2xx is ok", () => {
    expect(classifyObjectStatus(200)).toBe("ok")
    expect(classifyObjectStatus(206)).toBe("ok")
  })

  test("404/400 mean missing", () => {
    expect(classifyObjectStatus(404)).toBe("missing")
    expect(classifyObjectStatus(400)).toBe("missing")
  })

  test("network zero and other codes are errors", () => {
    expect(classifyObjectStatus(0)).toBe("error")
    expect(classifyObjectStatus(500)).toBe("error")
    expect(classifyObjectStatus(403)).toBe("error")
  })
})

describe("classifyThumbStatus", () => {
  test("2xx is ok", () => {
    expect(classifyThumbStatus(200)).toBe("ok")
  })

  test("400/404/415 are unreadable (the wall-blank case)", () => {
    expect(classifyThumbStatus(400)).toBe("unreadable")
    expect(classifyThumbStatus(404)).toBe("unreadable")
    expect(classifyThumbStatus(415)).toBe("unreadable")
  })

  test("other failures are probe errors", () => {
    expect(classifyThumbStatus(0)).toBe("error")
    expect(classifyThumbStatus(503)).toBe("error")
  })
})

describe("issuesFromProbes", () => {
  test("healthy image has no issues", () => {
    expect(
      issuesFromProbes({
        mediaType: "image",
        hasPosterPath: false,
        original: "ok",
        poster: null,
        thumb: "ok",
      })
    ).toEqual([])
  })

  test("missing original on an image", () => {
    expect(
      issuesFromProbes({
        mediaType: "image",
        hasPosterPath: false,
        original: "missing",
        poster: null,
        thumb: "unreadable",
      })
    ).toEqual(["missing_original"])
  })

  test("object ok but transform 400 → unreadable_thumb", () => {
    expect(
      issuesFromProbes({
        mediaType: "image",
        hasPosterPath: false,
        original: "ok",
        poster: null,
        thumb: "unreadable",
      })
    ).toEqual(["unreadable_thumb"])
  })

  test("video missing poster", () => {
    expect(
      issuesFromProbes({
        mediaType: "video",
        hasPosterPath: false,
        original: "ok",
        poster: null,
        thumb: "unreadable",
      })
    ).toEqual(["missing_poster"])
  })

  test("video with missing poster object", () => {
    expect(
      issuesFromProbes({
        mediaType: "video",
        hasPosterPath: true,
        original: "ok",
        poster: "missing",
        thumb: "unreadable",
      })
    ).toEqual(["missing_poster"])
  })

  test("video with present poster but unreadable thumb", () => {
    expect(
      issuesFromProbes({
        mediaType: "video",
        hasPosterPath: true,
        original: "ok",
        poster: "ok",
        thumb: "unreadable",
      })
    ).toEqual(["unreadable_thumb"])
  })

  test("dedupes probe_error across original + thumb", () => {
    expect(
      issuesFromProbes({
        mediaType: "image",
        hasPosterPath: false,
        original: "error",
        poster: null,
        thumb: "error",
      })
    ).toEqual(["probe_error"])
  })
})

describe("buildFinding", () => {
  test("returns null when healthy", () => {
    expect(
      buildFinding(imageRow, {
        original: "ok",
        poster: null,
        thumb: "ok",
      })
    ).toBeNull()
  })

  test("attaches issues and display path", () => {
    const finding = buildFinding(imageRow, {
      original: "ok",
      poster: null,
      thumb: "unreadable",
    })
    expect(finding?.issues).toEqual(["unreadable_thumb"])
    expect(finding?.displayPath).toBe("user/a.jpg")
  })
})

describe("summarizeFindings", () => {
  test("counts each issue class", () => {
    const findings: MediaHealthFinding[] = [
      {
        ...imageRow,
        id: "1",
        issues: ["missing_original"],
        displayPath: "a",
      },
      {
        ...videoRow,
        id: "2",
        issues: ["missing_poster", "unreadable_thumb"],
        displayPath: "b",
      },
      {
        ...imageRow,
        id: "3",
        issues: ["probe_error"],
        displayPath: "c",
      },
    ]
    expect(summarizeFindings(findings)).toEqual({
      total: 3,
      missingOriginal: 1,
      missingPoster: 1,
      unreadableThumb: 1,
      probeError: 1,
    })
  })
})

describe("issueLabel", () => {
  test("human labels for each issue", () => {
    expect(issueLabel("unreadable_thumb")).toContain("400")
    expect(issueLabel("missing_original")).toContain("original")
  })
})

describe("mapWithConcurrency", () => {
  test("preserves order with a concurrency cap", async () => {
    const started: number[] = []
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n)
      await Bun.sleep(5)
      return n * 10
    })
    expect(results).toEqual([10, 20, 30, 40, 50])
    expect(started).toEqual([1, 2, 3, 4, 5])
  })

  test("handles empty input", async () => {
    expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([])
  })
})

describe("MEDIA_HEALTH_PAGE_SIZE", () => {
  test("stays within a serverless-friendly batch", () => {
    expect(MEDIA_HEALTH_PAGE_SIZE).toBeGreaterThan(0)
    expect(MEDIA_HEALTH_PAGE_SIZE).toBeLessThanOrEqual(100)
  })
})
