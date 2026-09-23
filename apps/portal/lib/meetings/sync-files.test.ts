import { describe, expect, test } from "bun:test"

import {
  applyFileUpdates,
  combineListings,
  parsePropfind,
  planFileUpdates,
  PPT_EXT,
  propfindByDate,
  summarizeSyncResult,
  VIDEO_EXT,
  type PropfindResult,
} from "@/lib/meetings/sync-files"

const NC = "https://cloud.example"

const xmlFor = (entries: { name: string; fileid?: string }[]) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">` +
  `<d:response><d:href>/remote.php/dav/files/u/winlab/Meetings/2026/</d:href></d:response>` +
  entries
    .map(
      (e) =>
        `<d:response><d:href>/remote.php/dav/files/u/winlab/Meetings/2026/${encodeURIComponent(e.name)}</d:href>` +
        (e.fileid
          ? `<d:propstat><oc:fileid>${e.fileid}</oc:fileid></d:propstat>`
          : "") +
        `</d:response>`
    )
    .join("") +
  `</d:multistatus>`

const fetchReturning = (res: Response | Error) =>
  (async () => {
    if (res instanceof Error) throw res
    return res
  }) as unknown as typeof fetch

const propfind = (fetchFn: typeof fetch) =>
  propfindByDate({
    nextcloudUrl: NC,
    username: "u",
    authHeader: "Basic x",
    path: "winlab/Meetings/2026",
    extRegex: PPT_EXT,
    fetchFn,
  })

describe("parsePropfind", () => {
  test("keys by date prefix, filters extensions, first file wins", () => {
    const map = parsePropfind(
      xmlFor([
        { name: "2026-03-02 Alice.pptx", fileid: "11" },
        { name: "2026-03-02 Bob.pdf", fileid: "12" },
        { name: "2026-03-09 notes.txt", fileid: "13" },
        { name: "slides.pdf", fileid: "14" },
        { name: "2026-03-16 Carol.key" },
      ]),
      { nextcloudUrl: NC, path: "winlab/Meetings/2026", extRegex: PPT_EXT }
    )
    expect([...map]).toEqual([
      ["2026-03-02", `${NC}/f/11`],
      ["2026-03-16", `${NC}/apps/files/?dir=/winlab/Meetings/2026`],
    ])
  })

  test("video extensions", () => {
    const map = parsePropfind(
      xmlFor([{ name: "2026-03-02.mp4", fileid: "1" }]),
      {
        nextcloudUrl: NC,
        path: "p",
        extRegex: VIDEO_EXT,
      }
    )
    expect(map.get("2026-03-02")).toBe(`${NC}/f/1`)
  })
})

describe("propfindByDate", () => {
  test("2xx returns the parsed files", async () => {
    const r = await propfind(
      fetchReturning(
        new Response(xmlFor([{ name: "2026-03-02 A.pdf", fileid: "5" }]), {
          status: 207,
        })
      )
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.files.get("2026-03-02")).toBe(`${NC}/f/5`)
  })

  // The old code returned an empty map here, indistinguishable from a folder
  // with nothing new in it.
  test("Nextcloud non-ok reports the status, not an empty result", async () => {
    const r = await propfind(
      fetchReturning(
        new Response("nope", { status: 401, statusText: "Unauthorized" })
      )
    )
    expect(r).toEqual({ ok: false, status: 401, reason: "Unauthorized" })
  })

  test("fetch throwing reports a failure with no status", async () => {
    const r = await propfind(fetchReturning(new Error("ECONNREFUSED")))
    expect(r).toEqual({ ok: false, reason: "ECONNREFUSED" })
  })
})

const ok = (files: [string, string][] = []): PropfindResult => ({
  ok: true,
  files: new Map(files),
})
const listing = (label: string, result: PropfindResult) => ({
  label,
  path: `winlab/${label}`,
  result,
})

describe("combineListings", () => {
  test("both ok: no warnings", () => {
    const r = combineListings(listing("PPT", ok()), listing("錄影", ok()))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings).toEqual([])
  })

  test("unreachable Nextcloud is fatal even if the other listing worked", () => {
    const r = combineListings(
      listing("PPT", ok([["2026-03-02", "u"]])),
      listing("錄影", { ok: false, reason: "ECONNREFUSED" })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("無法讀取 NextCloud")
      expect(r.error).toContain("無法連線")
    }
  })

  test("401 / 403 are fatal", () => {
    for (const status of [401, 403]) {
      const r = combineListings(
        listing("PPT", { ok: false, status, reason: "x" }),
        listing("錄影", ok())
      )
      expect(r.ok).toBe(false)
    }
  })

  test("one folder 404 is partial: the other still links, with a warning", () => {
    const r = combineListings(
      listing("PPT", ok([["2026-03-02", "u"]])),
      listing("錄影", { ok: false, status: 404, reason: "Not Found" })
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.pptFiles.get("2026-03-02")).toBe("u")
      expect(r.videoFiles.size).toBe(0)
      expect(r.warnings).toHaveLength(1)
      expect(r.warnings[0]).toContain("HTTP 404")
    }
  })

  test("both folders failing is fatal, whatever the status", () => {
    const r = combineListings(
      listing("PPT", { ok: false, status: 500, reason: "x" }),
      listing("錄影", { ok: false, status: 404, reason: "y" })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.warnings).toHaveLength(2)
  })
})

describe("planFileUpdates", () => {
  test("links only missing links, never overwrites", () => {
    const plans = planFileUpdates(
      [
        {
          id: "a",
          scheduled_date: "2026-03-02",
          ppt_link: null,
          video_link: null,
        },
        {
          id: "b",
          scheduled_date: "2026-03-09",
          ppt_link: "old",
          video_link: null,
        },
        {
          id: "c",
          scheduled_date: "2026-03-16",
          ppt_link: null,
          video_link: null,
        },
      ],
      new Map([
        ["2026-03-02", "p1"],
        ["2026-03-09", "p2"],
      ]),
      new Map([["2026-03-02", "v1"]])
    )
    expect(plans).toEqual([
      {
        id: "a",
        date: "2026-03-02",
        patch: {
          ppt_link: "p1",
          ppt_uploaded: true,
          video_link: "v1",
          video_uploaded: true,
        },
        ppt: true,
        video: true,
      },
    ])
  })
})

describe("applyFileUpdates", () => {
  const plans = planFileUpdates(
    [
      {
        id: "a",
        scheduled_date: "2026-03-02",
        ppt_link: null,
        video_link: null,
      },
      {
        id: "b",
        scheduled_date: "2026-03-09",
        ppt_link: null,
        video_link: null,
      },
      {
        id: "c",
        scheduled_date: "2026-03-16",
        ppt_link: null,
        video_link: null,
      },
    ],
    new Map([
      ["2026-03-02", "p1"],
      ["2026-03-09", "p2"],
      ["2026-03-16", "p3"],
    ]),
    new Map([["2026-03-09", "v2"]])
  )

  test("all succeed", async () => {
    const r = await applyFileUpdates(plans, async () => ({ error: null }))
    expect(r).toEqual({
      pptUpdated: 3,
      videoUpdated: 1,
      failed: 0,
      warnings: [],
    })
  })

  // Counters used to go up before the write; a rejected update still counted.
  test("an update error is counted as failed, not as linked", async () => {
    const r = await applyFileUpdates(plans, async (id) =>
      id === "b" ? { error: { message: "permission denied" } } : { error: null }
    )
    expect(r.pptUpdated).toBe(2)
    expect(r.videoUpdated).toBe(0)
    expect(r.failed).toBe(1)
    expect(r.warnings).toEqual(["2026-03-09 的會議更新失敗：permission denied"])
  })

  test("a thrown update is a failure too, and doesn't sink the others", async () => {
    const r = await applyFileUpdates(plans, async (id) => {
      if (id === "c") throw new Error("socket hang up")
      return { error: null }
    })
    expect(r).toMatchObject({ pptUpdated: 2, videoUpdated: 1, failed: 1 })
  })
})

describe("summarizeSyncResult", () => {
  test("clean run is a success", () => {
    expect(
      summarizeSyncResult({
        pptUpdated: 2,
        videoUpdated: 1,
        failed: 0,
        warnings: [],
      })
    ).toEqual({
      level: "success",
      message: "掃描完成：PPT 2 筆、錄影 1 筆已連結",
    })
  })

  test("partial success (a folder warning) is a warning", () => {
    const s = summarizeSyncResult({
      pptUpdated: 2,
      videoUpdated: 0,
      failed: 0,
      warnings: ["錄影 資料夾 讀取失敗"],
    })
    expect(s.level).toBe("warning")
    expect(s.message).toContain("錄影 資料夾 讀取失敗")
  })

  test("any failed update is an error", () => {
    const s = summarizeSyncResult({
      pptUpdated: 1,
      videoUpdated: 0,
      failed: 1,
      warnings: ["2026-03-09 的會議更新失敗：x"],
    })
    expect(s.level).toBe("error")
    expect(s.message).toContain("1 筆更新失敗")
  })
})
