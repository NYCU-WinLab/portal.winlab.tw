import { describe, expect, test } from "bun:test"

import type { Deliverable } from "@/lib/rooms/deliverables"
import type { EpicRead, GitLabEpic } from "@/lib/gitlab/epics"

import { decideEpicLink, type EpicLinkFetchers } from "./epic-link"

const GROUP = "winlab/radio"

function epic(
  iid: number,
  classification: GitLabEpic["classification"] = "meeting"
): GitLabEpic {
  return {
    id: 100 + iid,
    iid,
    title: `Epic ${iid}`,
    description: null,
    webUrl: null,
    classification,
  }
}

function fetchers(
  reads: Record<number, EpicRead>,
  deliverables: Record<number, string[]> = {}
): EpicLinkFetchers & { fetched: number[] } {
  const fetched: number[] = []
  return {
    fetched,
    fetchEpic: async (_group, iid) => {
      fetched.push(iid)
      return (
        reads[iid] ?? {
          ok: false,
          reason: "not_found",
          status: 404,
          detail: "",
        }
      )
    },
    fetchEpicDeliverables: async (_group, e) => ({
      status: "ok",
      classification: e.classification,
      deliverables: (deliverables[e.iid] ?? []) as Deliverable[],
      issues: [],
      issueCount: 0,
    }),
  }
}

const ok = (e: GitLabEpic): EpicRead => ({ ok: true, epic: e })

describe("decideEpicLink", () => {
  test("no refs resolves to nothing without touching GitLab", async () => {
    const f = fetchers({})
    expect(await decideEpicLink(null, [], false, f)).toEqual({
      issueRefs: [],
      deliverables: [],
    })
    expect(f.fetched).toEqual([])
  })

  test("a group without gitlab_path cannot carry refs", async () => {
    await expect(
      decideEpicLink(null, ["&4"], false, fetchers({}))
    ).rejects.toThrow("gitlab_path")
  })

  test("malformed and foreign-group refs are rejected", async () => {
    const f = fetchers({ 4: ok(epic(4)) })
    await expect(
      decideEpicLink(GROUP, ["not-a-ref"], false, f)
    ).rejects.toThrow("Epic reference 無效或不屬於所選群組")
    await expect(
      decideEpicLink(GROUP, ["winlab/other&4"], false, f)
    ).rejects.toThrow("Epic reference 無效或不屬於所選群組")
    expect(f.fetched).toEqual([])
  })

  test("the same epic named twice is fetched and stored once", async () => {
    const f = fetchers({ 4: ok(epic(4)) })
    const link = await decideEpicLink(
      GROUP,
      [
        "&4",
        `${GROUP}&4`,
        `https://gitlab.winlab.tw/groups/${GROUP}/-/epics/4`,
      ],
      false,
      f
    )
    expect(link.issueRefs).toEqual([`${GROUP}&4`])
    expect(f.fetched).toEqual([4])
  })

  test("a 404 says the epic is gone", async () => {
    const f = fetchers({
      4: {
        ok: false,
        reason: "not_found",
        status: 404,
        detail: "GitLab 回應 404",
      },
    })
    await expect(decideEpicLink(GROUP, ["&4"], false, f)).rejects.toThrow(
      `所選 Epic 已不存在（${GROUP}&4）`
    )
  })

  test("an outage says try again later, with the status", async () => {
    for (const status of [401, 403, 503]) {
      const f = fetchers({
        4: { ok: false, reason: "unavailable", status, detail: "x" },
      })
      await expect(decideEpicLink(GROUP, ["&4"], false, f)).rejects.toThrow(
        `GitLab 目前無法讀取 Epic（HTTP ${status}），請稍後再試`
      )
    }
  })

  test("an outage with no status says why instead", async () => {
    const f = fetchers({
      4: {
        ok: false,
        reason: "unavailable",
        detail: "GITLAB_API_TOKEN 未設定",
      },
    })
    await expect(decideEpicLink(GROUP, ["&4"], false, f)).rejects.toThrow(
      "GitLab 目前無法讀取 Epic（GITLAB_API_TOKEN 未設定），請稍後再試"
    )
  })

  test("a recurring series accepts only Sync containers", async () => {
    const f = fetchers({
      1: ok(epic(1, "sync")),
      2: ok(epic(2, "meeting")),
      3: ok(epic(3, "report")),
    })
    expect(await decideEpicLink(GROUP, ["&1"], true, f)).toEqual({
      issueRefs: [`${GROUP}&1`],
      deliverables: [],
    })
    for (const ref of ["&2", "&3"]) {
      await expect(decideEpicLink(GROUP, [ref], true, f)).rejects.toThrow(
        "固定群組會議只能選 Sync container"
      )
    }
    // A one-off booking may use any of them.
    expect(
      (await decideEpicLink(GROUP, ["&2", "&3"], false, f)).issueRefs
    ).toEqual([`${GROUP}&2`, `${GROUP}&3`])
  })

  test("a deliverables failure fails the booking", async () => {
    const f: EpicLinkFetchers = {
      fetchEpic: async () => ok(epic(4)),
      fetchEpicDeliverables: async () => ({ status: "error", detail: "boom" }),
    }
    await expect(decideEpicLink(GROUP, ["&4"], false, f)).rejects.toThrow(
      "無法確認所選 Epic:boom"
    )
  })
})
