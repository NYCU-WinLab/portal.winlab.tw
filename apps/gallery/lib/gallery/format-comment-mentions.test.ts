import { describe, expect, test } from "bun:test"

import { isGalleryMemberMention } from "@/lib/gallery/format-comment-mentions"
import type { GalleryMember } from "@/lib/gallery/types"

const members: GalleryMember[] = [
  { id: "1", name: "Alice", email: "alice@example.com" },
]

describe("isGalleryMemberMention", () => {
  test("matches names case-insensitively", () => {
    expect(isGalleryMemberMention("alice", members)).toBe(true)
    expect(isGalleryMemberMention("ALICE", members)).toBe(true)
  })

  test("rejects unknown handles", () => {
    expect(isGalleryMemberMention("nobody", members)).toBe(false)
  })
})
