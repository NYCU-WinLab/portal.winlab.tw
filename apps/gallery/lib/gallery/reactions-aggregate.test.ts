import { describe, expect, test } from "bun:test"

import {
  aggregateReactions,
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
} from "@/lib/gallery/reactions"

type VoteRow = { image_id: string; user_id: string; reaction: string }

describe("aggregateReactions", () => {
  test("returns empty maps for no rows", () => {
    const { countsByImage, namesByImage } = aggregateReactions([], new Map())
    expect(countsByImage.size).toBe(0)
    expect(namesByImage.size).toBe(0)
  })

  test("counts a single reaction and records the voter name", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u1", reaction: "like" },
    ]
    const names = new Map([["u1", "Alice"]])
    const { countsByImage, namesByImage } = aggregateReactions(rows, names)

    expect(countsByImage.get("img1")).toEqual({
      ...EMPTY_REACTION_COUNTS,
      like: 1,
    })
    expect(namesByImage.get("img1")).toEqual({
      ...EMPTY_REACTION_NAMES,
      like: ["Alice"],
    })
  })

  test("accumulates multiple voters for the same image + reaction", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u1", reaction: "love" },
      { image_id: "img1", user_id: "u2", reaction: "love" },
    ]
    const names = new Map([
      ["u1", "Alice"],
      ["u2", "Bob"],
    ])
    const { countsByImage, namesByImage } = aggregateReactions(rows, names)

    expect(countsByImage.get("img1")?.love).toBe(2)
    expect(namesByImage.get("img1")?.love).toEqual(["Alice", "Bob"])
  })

  test("preserves voter-name order as rows are seen", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u2", reaction: "haha" },
      { image_id: "img1", user_id: "u1", reaction: "haha" },
    ]
    const names = new Map([
      ["u1", "Alice"],
      ["u2", "Bob"],
    ])
    const { namesByImage } = aggregateReactions(rows, names)

    expect(namesByImage.get("img1")?.haha).toEqual(["Bob", "Alice"])
  })

  test("separates counts and names across different images", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u1", reaction: "like" },
      { image_id: "img2", user_id: "u2", reaction: "wow" },
    ]
    const names = new Map([
      ["u1", "Alice"],
      ["u2", "Bob"],
    ])
    const { countsByImage, namesByImage } = aggregateReactions(rows, names)

    expect(countsByImage.size).toBe(2)
    expect(countsByImage.get("img1")?.like).toBe(1)
    expect(countsByImage.get("img2")?.wow).toBe(1)
    expect(namesByImage.get("img1")?.like).toEqual(["Alice"])
    expect(namesByImage.get("img2")?.wow).toEqual(["Bob"])
  })

  test("separates counts across different reactions on one image", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u1", reaction: "like" },
      { image_id: "img1", user_id: "u2", reaction: "angry" },
      { image_id: "img1", user_id: "u3", reaction: "point" },
    ]
    const names = new Map([
      ["u1", "Alice"],
      ["u2", "Bob"],
      ["u3", "Carol"],
    ])
    const { countsByImage, namesByImage } = aggregateReactions(rows, names)

    expect(countsByImage.get("img1")).toEqual({
      ...EMPTY_REACTION_COUNTS,
      like: 1,
      angry: 1,
      point: 1,
    })
    expect(namesByImage.get("img1")?.like).toEqual(["Alice"])
    expect(namesByImage.get("img1")?.angry).toEqual(["Bob"])
    expect(namesByImage.get("img1")?.point).toEqual(["Carol"])
  })

  test("skips unknown reactions entirely (no map entry created)", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u1", reaction: "fire" },
    ]
    const names = new Map([["u1", "Alice"]])
    const { countsByImage, namesByImage } = aggregateReactions(rows, names)

    expect(countsByImage.has("img1")).toBe(false)
    expect(namesByImage.has("img1")).toBe(false)
    expect(countsByImage.size).toBe(0)
    expect(namesByImage.size).toBe(0)
  })

  test("keeps valid reactions while dropping unknown ones on the same image", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u1", reaction: "like" },
      { image_id: "img1", user_id: "u2", reaction: "fire" },
      { image_id: "img1", user_id: "u3", reaction: "sad" },
    ]
    const names = new Map([
      ["u1", "Alice"],
      ["u2", "Bob"],
      ["u3", "Carol"],
    ])
    const { countsByImage, namesByImage } = aggregateReactions(rows, names)

    expect(countsByImage.get("img1")).toEqual({
      ...EMPTY_REACTION_COUNTS,
      like: 1,
      sad: 1,
    })
    expect(namesByImage.get("img1")?.like).toEqual(["Alice"])
    expect(namesByImage.get("img1")?.sad).toEqual(["Carol"])
    // Bob's unknown "fire" leaves no trace anywhere
    expect(namesByImage.get("img1")?.angry).toEqual([])
  })

  test("falls back to 'Unknown' when the voter id is missing from the name map", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "ghost", reaction: "love" },
    ]
    const { countsByImage, namesByImage } = aggregateReactions(rows, new Map())

    expect(countsByImage.get("img1")?.love).toBe(1)
    expect(namesByImage.get("img1")?.love).toEqual(["Unknown"])
  })

  test("mixes known and unknown voter names in the same reaction list", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u1", reaction: "wow" },
      { image_id: "img1", user_id: "ghost", reaction: "wow" },
    ]
    const names = new Map([["u1", "Alice"]])
    const { namesByImage } = aggregateReactions(rows, names)

    expect(namesByImage.get("img1")?.wow).toEqual(["Alice", "Unknown"])
  })

  test("name list length tracks the count for that reaction", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u1", reaction: "like" },
      { image_id: "img1", user_id: "u2", reaction: "like" },
      { image_id: "img1", user_id: "u3", reaction: "like" },
    ]
    const names = new Map([
      ["u1", "Alice"],
      ["u2", "Bob"],
      ["u3", "Carol"],
    ])
    const { countsByImage, namesByImage } = aggregateReactions(rows, names)

    const count = countsByImage.get("img1")!.like
    expect(count).toBe(3)
    expect(namesByImage.get("img1")!.like).toHaveLength(count)
  })

  test("counts the same user twice if they appear in two rows (no dedupe)", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u1", reaction: "like" },
      { image_id: "img1", user_id: "u1", reaction: "like" },
    ]
    const names = new Map([["u1", "Alice"]])
    const { countsByImage, namesByImage } = aggregateReactions(rows, names)

    expect(countsByImage.get("img1")?.like).toBe(2)
    expect(namesByImage.get("img1")?.like).toEqual(["Alice", "Alice"])
  })

  test("does not mutate the shared EMPTY_REACTION_COUNTS / EMPTY_REACTION_NAMES singletons", () => {
    const rows: VoteRow[] = [
      { image_id: "img1", user_id: "u1", reaction: "like" },
    ]
    aggregateReactions(rows, new Map([["u1", "Alice"]]))

    expect(EMPTY_REACTION_COUNTS.like).toBe(0)
    expect(EMPTY_REACTION_NAMES.like).toEqual([])
  })
})
