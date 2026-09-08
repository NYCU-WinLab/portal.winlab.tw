import { describe, expect, test } from "bun:test"

import { nextReactionState } from "@/lib/gallery/reaction-optimistic"
import {
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
} from "@/lib/gallery/reactions"

describe("nextReactionState", () => {
  test("adds a first reaction", () => {
    const next = nextReactionState(
      null,
      "like",
      "Ada",
      EMPTY_REACTION_COUNTS,
      EMPTY_REACTION_NAMES
    )
    expect(next.outcome).toBe("added")
    expect(next.myReaction).toBe("like")
    expect(next.counts.like).toBe(1)
    expect(next.names.like).toEqual(["Ada"])
  })

  test("removes the same reaction on toggle", () => {
    const next = nextReactionState(
      "like",
      "like",
      "Ada",
      { ...EMPTY_REACTION_COUNTS, like: 2 },
      { ...EMPTY_REACTION_NAMES, like: ["Ada", "Bob"] }
    )
    expect(next.outcome).toBe("removed")
    expect(next.myReaction).toBeNull()
    expect(next.counts.like).toBe(1)
    expect(next.names.like).toEqual(["Bob"])
  })

  test("switches from one reaction to another", () => {
    const next = nextReactionState(
      "like",
      "love",
      "Ada",
      { ...EMPTY_REACTION_COUNTS, like: 1, love: 0 },
      { ...EMPTY_REACTION_NAMES, like: ["Ada"], love: [] }
    )
    expect(next.outcome).toBe("updated")
    expect(next.myReaction).toBe("love")
    expect(next.counts).toMatchObject({ like: 0, love: 1 })
    expect(next.names.like).toEqual([])
    expect(next.names.love).toEqual(["Ada"])
  })

  test("does not duplicate viewer name when switching onto an existing list", () => {
    const next = nextReactionState(
      "like",
      "love",
      "Ada",
      { ...EMPTY_REACTION_COUNTS, like: 1, love: 1 },
      { ...EMPTY_REACTION_NAMES, like: ["Ada"], love: ["Ada"] }
    )
    expect(next.names.love).toEqual(["Ada"])
  })
})
