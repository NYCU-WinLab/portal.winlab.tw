import { describe, expect, test } from "bun:test"

import { planCommentMentionSync } from "@/lib/gallery/notification-sync"

const AUTHOR = "author-1"
const ALICE = { id: "u-alice", name: "Alice" }
const BOB = { id: "u-bob", name: "Bob" }
const AUTHOR_PROFILE = { id: AUTHOR, name: "Author" }

describe("planCommentMentionSync", () => {
  test("clears all when body has no mentions but rows exist", () => {
    const plan = planCommentMentionSync({
      body: "no tags here",
      authorId: AUTHOR,
      existingMentionUserIds: [ALICE.id],
      profiles: [ALICE, BOB],
    })
    expect(plan.clearAll).toBe(true)
    expect(plan.toAdd).toEqual([])
    expect(plan.toRemove).toEqual([ALICE.id])
  })

  test("adds newly mentioned users and skips the author", () => {
    const plan = planCommentMentionSync({
      body: "hi @Alice and @Author",
      authorId: AUTHOR,
      existingMentionUserIds: [],
      profiles: [ALICE, BOB, AUTHOR_PROFILE],
    })
    expect(plan.clearAll).toBe(false)
    expect(plan.toAdd.map((p) => p.id)).toEqual([ALICE.id])
    expect(plan.toRemove).toEqual([])
  })

  test("removes stale mentions and adds new ones", () => {
    const plan = planCommentMentionSync({
      body: "ping @Bob",
      authorId: AUTHOR,
      existingMentionUserIds: [ALICE.id],
      profiles: [ALICE, BOB],
    })
    expect(plan.toRemove).toEqual([ALICE.id])
    expect(plan.toAdd.map((p) => p.id)).toEqual([BOB.id])
  })

  test("no-ops when mention set is unchanged", () => {
    const plan = planCommentMentionSync({
      body: "@Alice",
      authorId: AUTHOR,
      existingMentionUserIds: [ALICE.id],
      profiles: [ALICE],
    })
    expect(plan.toAdd).toEqual([])
    expect(plan.toRemove).toEqual([])
    expect(plan.clearAll).toBe(false)
  })
})
