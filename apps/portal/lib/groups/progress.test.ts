import { describe, expect, test } from "bun:test"
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error"

import { UNAUTHORIZED } from "@/lib/groups/messages"
import {
  applyOutcome,
  CHUNK_SIZE,
  classifyChunk,
  jobView,
  markDispatched,
  newJob,
  nextChunk,
  pickNext,
  stopJob,
  thrownReply,
  waitingRows,
  type BatchJob,
  type ChunkReply,
} from "@/lib/groups/progress"
import type { MemberChangeResult } from "@/lib/groups/types"

const addrs = (n: number, p = "u") =>
  Array.from({ length: n }, (_, i) => `${p}${i}@x.org`)

const res = (
  email: string,
  outcome: MemberChangeResult["outcome"],
  extra: Partial<MemberChangeResult> = {}
): MemberChangeResult => ({ email, outcome, ...extra })

const okAll = (emails: string[]): ChunkReply => ({
  status: "ok",
  data: emails.map((e) => res(e, "ok")),
})

const job = (id: number, groupId: string, n: number): BatchJob =>
  newJob(id, {
    groupId,
    groupEmail: `${groupId}@winlab.tw`,
    emails: addrs(n),
  })

/** Send the next chunk and apply its reply. */
function step(j: BatchJob, reply: (chunk: string[]) => ChunkReply): BatchJob {
  const chunk = nextChunk(j)
  return applyOutcome(
    markDispatched(j, chunk),
    classifyChunk(chunk, reply(chunk))
  )
}

describe("nextChunk / markDispatched", () => {
  test("takes CHUNK_SIZE addresses from where dispatch left off", () => {
    expect(CHUNK_SIZE).toBe(10)
    const j = job(1, "A", 25)
    expect(nextChunk(j)).toEqual(addrs(25).slice(0, 10))
    const d = markDispatched(
      markDispatched(j, addrs(25).slice(0, 10)),
      addrs(25).slice(10, 20)
    )
    expect(nextChunk(d)).toEqual(addrs(25).slice(20))
    expect(d.dispatched).toBe(20)
    expect(d.inFlight).toBe(10)
  })
})

describe("classifyChunk", () => {
  const chunk = ["u0@x.org", "u1@x.org", "u2@x.org"]

  test("ok: counts per address, overlay keys on listedAs, an error asks for a re-read", () => {
    const o = classifyChunk(chunk, {
      status: "ok",
      data: [
        res("u0@x.org", "ok", { listedAs: "u.0@x.org" }),
        res("u1@x.org", "already"),
        res("u2@x.org", "error", { detail: "逾時，結果未知" }),
      ],
    })
    expect(o).toMatchObject({
      added: 1,
      already: 1,
      unknown: [],
      unsent: [],
      stop: null,
      recheck: true,
      detail: null,
    })
    expect(o.failed).toEqual([{ email: "u2@x.org", detail: "逾時，結果未知" }])
    expect(o.landed).toEqual(["u.0@x.org", "u1@x.org"])
  })

  test("ok with no error: no re-read", () => {
    expect(classifyChunk(chunk, okAll(chunk)).recheck).toBe(false)
  })

  test("a failed address without detail is reported by its outcome", () => {
    const o = classifyChunk(["u0@x.org"], {
      status: "ok",
      data: [res("u0@x.org", "error")],
    })
    expect(o.failed).toEqual([{ email: "u0@x.org", detail: "error" }])
  })

  test("stopped part-way: entries count, the rest were never tried", () => {
    const o = classifyChunk(chunk, {
      status: "error",
      detail: "期限已到",
      sent: true,
      results: [res("u0@x.org", "ok")],
    })
    expect(o).toMatchObject({
      added: 1,
      unsent: ["u1@x.org", "u2@x.org"],
      unknown: [],
      stop: "group",
      recheck: true,
      detail: "期限已到",
    })
    expect(o.landed).toEqual(["u0@x.org"])
  })

  test("portal refusal before any send: whole chunk unsent, group stop", () => {
    const o = classifyChunk(chunk, {
      status: "forbidden",
      reason: "not_managed",
      detail: "你不是這個群組的管理者",
      sent: false,
    })
    expect(o).toMatchObject({
      unsent: chunk,
      unknown: [],
      stop: "group",
      recheck: false,
      detail: "你不是這個群組的管理者",
    })
  })

  test("failure that may have landed, no results: whole chunk unknown", () => {
    const o = classifyChunk(chunk, {
      status: "error",
      detail: "逾時，結果未知",
    })
    expect(o).toMatchObject({
      unknown: chunk,
      unsent: [],
      stop: "group",
      recheck: true,
    })
  })

  test("signed out: global stop, unsent, readable message", () => {
    const o = classifyChunk(chunk, {
      status: "error",
      detail: UNAUTHORIZED,
      sent: false,
    })
    expect(o).toMatchObject({
      unsent: chunk,
      stop: "global",
      recheck: false,
      detail: "登入已失效，請重新整理頁面後再試",
    })
  })

  test("unconfigured: global stop", () => {
    expect(classifyChunk(chunk, { status: "unconfigured" })).toMatchObject({
      unsent: chunk,
      stop: "global",
      recheck: false,
      detail: "Google 群組整合尚未設定",
    })
  })

  test("Google refusing the service account mid-way: global, unknown", () => {
    const o = classifyChunk(chunk, {
      status: "forbidden",
      reason: "google_permission",
      detail: "Google 403（forbidden）",
      sent: true,
    })
    expect(o).toMatchObject({ unknown: chunk, stop: "global", recheck: true })
  })

  test("the action threw: global, unknown, reload advised", () => {
    const reply = thrownReply(new TypeError("Failed to fetch"))
    expect(classifyChunk(chunk, reply)).toMatchObject({
      unknown: chunk,
      unsent: [],
      stop: "global",
      recheck: true,
      detail: "連線中斷，請重新整理頁面後再試",
    })
  })

  // What Next.js throws when a deploy since the page loaded took the action
  // away: the server ran nothing, and only a reload gets the new one.
  test("the action is gone after a deploy: global, unsent, reload advised", () => {
    const gone = new UnrecognizedActionError('Server Action "x" was not found')
    expect(classifyChunk(chunk, thrownReply(gone))).toMatchObject({
      unknown: [],
      unsent: chunk,
      stop: "global",
      recheck: false,
      detail: "網站已更新，請重新整理頁面後再試",
    })
  })
})

describe("applyOutcome / stopJob", () => {
  test("a chunk in the middle: counts add up, inFlight clears, not done", () => {
    const j = step(job(1, "A", 25), okAll)
    expect(j).toMatchObject({
      dispatched: 10,
      inFlight: 0,
      added: 10,
      done: false,
    })
  })

  test("the last chunk: done", () => {
    const j = step(step(step(job(1, "A", 25), okAll), okAll), okAll)
    expect(j).toMatchObject({ dispatched: 25, added: 25, done: true })
    expect(j.unsent).toEqual([])
  })

  test("a stop: the rest of the batch joins unsent, stopDetail set, done", () => {
    const j = step(job(1, "A", 25), (chunk) => ({
      status: "error",
      detail: "期限已到",
      sent: true,
      results: [res(chunk[0]!, "ok")],
    }))
    expect(j).toMatchObject({
      added: 1,
      inFlight: 0,
      stopDetail: "期限已到",
      done: true,
    })
    expect(j.unsent).toEqual(addrs(25).slice(1))
  })

  test("stopJob on a queued job: every address unsent, done", () => {
    const j = stopJob(job(2, "A", 5), "連線中斷")
    expect(j).toMatchObject({ stopDetail: "連線中斷", done: true })
    expect(j.unsent).toEqual(addrs(5))
  })
})

describe("pickNext", () => {
  test("FIFO within a group: the older batch first", () => {
    const jobs = [job(1, "A", 5), job(2, "A", 5)]
    expect(pickNext(jobs, new Map())?.id).toBe(1)
  })

  test("round-robin: a group never served beats one served; least recently served next", () => {
    const jobs = [job(1, "A", 25), job(2, "B", 25)]
    expect(pickNext(jobs, new Map([["A", 0]]))?.id).toBe(2)
    expect(
      pickNext(
        jobs,
        new Map([
          ["A", 0],
          ["B", 1],
        ])
      )?.id
    ).toBe(1)
    expect(
      pickNext(
        jobs,
        new Map([
          ["A", 3],
          ["B", 1],
        ])
      )?.id
    ).toBe(2)
  })

  test("ties go to the older head job; done jobs are ignored; none left → null", () => {
    const a = job(1, "A", 5)
    const b = job(2, "B", 5)
    expect(pickNext([a, b], new Map())?.id).toBe(1)
    const aDone = stopJob(a, null)
    expect(pickNext([aDone, b], new Map())?.id).toBe(2)
    expect(pickNext([aDone, stopJob(b, null)], new Map())).toBeNull()
  })
})

describe("waitingRows", () => {
  test("addresses with no result yet; the in-flight chunk is `sending`", () => {
    const first = markDispatched(job(1, "A", 25), addrs(25).slice(0, 10))
    const rows = waitingRows([first], "A")
    expect(rows.map((r) => r.email)).toEqual(addrs(25))
    expect(rows.filter((r) => r.sending).map((r) => r.email)).toEqual(
      addrs(25).slice(0, 10)
    )

    const second = markDispatched(
      step(job(1, "A", 25), okAll),
      addrs(25).slice(10, 20)
    )
    const later = waitingRows([second], "A")
    expect(later.map((r) => r.email)).toEqual(addrs(25).slice(10))
    expect(later.filter((r) => r.sending).map((r) => r.email)).toEqual(
      addrs(25).slice(10, 20)
    )
  })

  test("only this group's unfinished jobs", () => {
    const jobs = [job(1, "A", 2), job(2, "B", 3), stopJob(job(3, "A", 4), null)]
    expect(waitingRows(jobs, "A").map((r) => r.email)).toEqual(addrs(2))
  })
})

describe("jobView", () => {
  test("queued behind an older unfinished batch of the same group", () => {
    const jobs = [job(1, "A", 25), job(2, "A", 5)]
    expect(jobView(jobs[1]!, jobs)).toEqual({
      tone: "queued",
      title: "A@winlab.tw 排隊中（5 人）",
      lines: [],
      progress: null,
      retry: [],
    })
  })

  test("running, N ≥ 2: k/N counts the addresses that have a result", () => {
    const j = markDispatched(
      step(job(1, "A", 25), okAll),
      addrs(25).slice(10, 20)
    )
    expect(jobView(j, [j])).toEqual({
      tone: "running",
      title: "正在加入 10 / 25",
      lines: ["A@winlab.tw", "請先別關掉或重新整理這一頁"],
      progress: { done: 10, total: 25 },
      retry: [],
    })
  })

  test("running, N = 1: no k/N", () => {
    const j = job(1, "A", 1)
    expect(jobView(j, [j])).toMatchObject({
      tone: "running",
      title: "正在加入",
      progress: null,
    })
  })

  test("success: who was added and who was already there", () => {
    const j = step(job(1, "A", 5), (chunk) => ({
      status: "ok",
      data: chunk.map((e, i) => res(e, i < 3 ? "ok" : "already")),
    }))
    expect(jobView(j, [j])).toEqual({
      tone: "success",
      title: "已加入 3 人，2 人原本就在",
      lines: ["A@winlab.tw"],
      progress: null,
      retry: [],
    })
  })

  test("success with nobody already: no already part", () => {
    const j = step(job(1, "A", 3), okAll)
    expect(jobView(j, [j]).title).toBe("已加入 3 人")
  })

  test("failure: zero parts omitted, reasons listed, retry = failed + unknown + unsent", () => {
    const j: BatchJob = {
      ...job(1, "A", 8),
      dispatched: 4,
      added: 1,
      failed: [
        { email: "u1@x.org", detail: "Google 400（invalid）" },
        { email: "u2@x.org", detail: "逾時，結果未知" },
      ],
      unknown: ["u3@x.org"],
      unsent: addrs(8).slice(4),
      stopDetail: "期限已到",
      done: true,
    }
    expect(jobView(j, [j])).toEqual({
      tone: "failure",
      title: "已加入 1 人，失敗 2 人，結果未知 1 人，未送出 4 人",
      lines: [
        "A@winlab.tw",
        "期限已到",
        "u1@x.org（Google 400（invalid））",
        "u2@x.org（逾時，結果未知）",
      ],
      progress: null,
      retry: ["u1@x.org", "u2@x.org", "u3@x.org", ...addrs(8).slice(4)],
    })
  })

  // Nothing failed outright, but some addresses never got an answer or were
  // never sent: that is no success.
  for (const [field, word] of [
    ["unknown", "結果未知"],
    ["unsent", "未送出"],
  ] as const)
    test(`only ${field} addresses left over: a failure that retries them`, () => {
      const j: BatchJob = {
        ...job(1, "A", 3),
        dispatched: 3,
        added: 2,
        [field]: ["u2@x.org"],
        done: true,
      }
      expect(jobView(j, [j])).toMatchObject({
        tone: "failure",
        title: `已加入 2 人，${word} 1 人`,
        retry: ["u2@x.org"],
      })
    })

  test("200 failures: 5 address lines plus a count of the rest", () => {
    const j = step(job(1, "A", 200), (chunk) => ({
      status: "ok",
      data: chunk.map((e) => res(e, "error", { detail: "x" })),
    }))
    // One chunk is 10; fill the rest as if every chunk failed the same way.
    const all: BatchJob = {
      ...j,
      dispatched: 200,
      failed: addrs(200).map((email) => ({ email, detail: "x" })),
      done: true,
    }
    const view = jobView(all, [all])
    expect(view.title).toBe("已加入 0 人，失敗 200 人")
    expect(view.lines).toEqual([
      "A@winlab.tw",
      ...addrs(5).map((e) => `${e}（x）`),
      "另外 195 個",
    ])
    expect(view.retry).toHaveLength(200)
  })
})
