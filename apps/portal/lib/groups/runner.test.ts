import { describe, expect, test } from "bun:test"

import { jobView, type BatchJob } from "@/lib/groups/progress"
import { createBatchRunner } from "@/lib/groups/runner"
import type { GroupsResult, MemberChangeResult } from "@/lib/groups/types"

type Reply = GroupsResult<MemberChangeResult[]>

const addrs = (n: number, p = "u") =>
  Array.from({ length: n }, (_, i) => `${p}${i}@x.org`)

const okAll = (emails: string[]): Reply => ({
  status: "ok",
  data: emails.map((e) => ({ email: e, outcome: "ok" })),
})

const batch = (groupId: string, n: number, p = "u") => ({
  groupId,
  groupEmail: `${groupId}@winlab.tw`,
  emails: addrs(n, p),
})

/** A runner over a fake dispatch that records every call and event. */
function harness(
  reply: (groupId: string, emails: string[]) => Reply | Promise<Reply> = (
    _,
    emails
  ) => okAll(emails)
) {
  const calls: [string, number][] = []
  const changes: (readonly BatchJob[])[] = []
  const landed: [string, string[]][] = []
  const uncertain: string[] = []
  const runner = createBatchRunner(
    async (groupId, emails) => {
      calls.push([groupId, emails.length])
      return reply(groupId, emails)
    },
    {
      onChange: (jobs) => changes.push(jobs),
      onLanded: (groupId, emails) => landed.push([groupId, emails]),
      onUncertain: (groupId) => uncertain.push(groupId),
    }
  )
  return { runner, calls, changes, landed, uncertain }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe("createBatchRunner", () => {
  test("two groups interleave chunk by chunk", async () => {
    const h = harness()
    h.runner.enqueue(batch("A", 25))
    h.runner.enqueue(batch("B", 15))
    await h.runner.idle()
    expect(h.calls).toEqual([
      ["A", 10],
      ["B", 10],
      ["A", 10],
      ["B", 5],
      ["A", 5],
    ])
    const last = h.changes.at(-1)!
    expect(last.map((j) => [j.done, j.added])).toEqual([
      [true, 25],
      [true, 15],
    ])
  })

  test("a second batch on the same group waits for the first", async () => {
    const h = harness()
    h.runner.enqueue(batch("A", 15, "a"))
    h.runner.enqueue(batch("A", 5, "b"))
    await h.runner.idle()
    expect(h.calls).toEqual([
      ["A", 10],
      ["A", 5],
      ["A", 5],
    ])
    const before = h.changes.filter(
      (jobs) => jobs.length === 2 && !jobs[0]!.done
    )
    expect(before.length).toBeGreaterThan(0)
    for (const jobs of before)
      expect(jobView(jobs[1]!, jobs).tone).toBe("queued")
  })

  test("a group refusal stops that group's queued batches, others continue", async () => {
    const h = harness((groupId, emails) =>
      groupId === "A"
        ? {
            status: "forbidden",
            reason: "not_managed",
            detail: "你不是這個群組的管理者",
            sent: false,
          }
        : okAll(emails)
    )
    h.runner.enqueue(batch("A", 15, "a"))
    h.runner.enqueue(batch("A", 5, "b"))
    h.runner.enqueue(batch("B", 5))
    await h.runner.idle()
    expect(h.calls.filter(([g]) => g === "A")).toEqual([["A", 10]])
    const [a1, a2, b] = h.changes.at(-1)!
    expect([a1!.done, a1!.unsent.length, a1!.added]).toEqual([true, 15, 0])
    expect([a2!.done, a2!.unsent.length]).toEqual([true, 5])
    expect([b!.done, b!.added]).toEqual([true, 5])
  })

  test("a global stop ends every job and dispatches nothing more", async () => {
    const h = harness(() => {
      throw new Error("network down")
    })
    h.runner.enqueue(batch("A", 25))
    h.runner.enqueue(batch("B", 5))
    await h.runner.idle()
    expect(h.calls).toEqual([["A", 10]])
    const [a, b] = h.changes.at(-1)!
    expect([a!.done, a!.unknown.length, a!.unsent.length]).toEqual([
      true,
      10,
      15,
    ])
    expect([b!.done, b!.unsent.length]).toEqual([true, 5])
  })

  test("stop() halts: no dispatch after, no onChange when the in-flight reply lands", async () => {
    let resolve!: (r: Reply) => void
    const h = harness(
      () =>
        new Promise<Reply>((r) => {
          resolve = r
        })
    )
    h.runner.enqueue(batch("A", 25))
    await tick()
    expect(h.calls).toEqual([["A", 10]])
    const seen = h.changes.length
    h.runner.stop()
    resolve(okAll(addrs(10)))
    await h.runner.idle()
    h.runner.enqueue(batch("B", 5))
    await h.runner.idle()
    expect(h.calls).toEqual([["A", 10]])
    expect(h.changes.length).toBe(seen)
    expect(h.landed).toEqual([])
  })

  test("landed and uncertain addresses are reported per group", async () => {
    const h = harness(() => ({
      status: "ok",
      data: [
        { email: "u0@x.org", outcome: "ok", listedAs: "u.0@x.org" },
        { email: "u1@x.org", outcome: "already" },
        { email: "u2@x.org", outcome: "error", detail: "逾時，結果未知" },
      ],
    }))
    h.runner.enqueue(batch("A", 3))
    await h.runner.idle()
    expect(h.landed).toEqual([["A", ["u.0@x.org", "u1@x.org"]]])
    expect(h.uncertain).toEqual(["A"])
  })

  test("an empty batch is ignored", async () => {
    const h = harness()
    h.runner.enqueue(batch("A", 0))
    await h.runner.idle()
    expect(h.changes).toEqual([])
    expect(h.calls).toEqual([])
  })

  // A batch's toast is keyed by its id, and sonner keeps every toast it has
  // seen for the life of the page: leaving /groups and coming back builds a
  // new runner, whose first batch must not update the last visit's toast.
  test("a second runner never reuses a job id", async () => {
    const ids = async () => {
      const h = harness()
      h.runner.enqueue(batch("A", 3))
      await h.runner.idle()
      h.runner.stop()
      return h.changes.flat().map((j) => j.id)
    }
    const first = new Set(await ids())
    const second = await ids()
    expect(second.length).toBeGreaterThan(0)
    expect(second.filter((id) => first.has(id))).toEqual([])
  })
})
