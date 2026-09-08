import { describe, expect, test } from "bun:test"

import {
  notificationSummary,
  truncateNotificationBody,
} from "@/lib/gallery/notification-copy"
import type { GalleryNotification } from "@/lib/gallery/notifications"

function note(
  partial: Pick<GalleryNotification, "kind" | "actor_name" | "image_name">
): GalleryNotification {
  return {
    key: "k",
    kind: partial.kind,
    actor_name: partial.actor_name,
    image_name: partial.image_name,
    image_id: "img",
    comment_id: "c",
    body: "hello",
    reaction: null,
    created_at: "2026-01-01T00:00:00.000Z",
    mention_comment_id: null,
    activity_id: null,
  }
}

describe("truncateNotificationBody", () => {
  test("keeps short bodies", () => {
    expect(truncateNotificationBody("  hi  ")).toBe("hi")
  })

  test("truncates long bodies with an ellipsis", () => {
    const long = "a".repeat(80)
    const out = truncateNotificationBody(long, 10)
    expect(out.length).toBe(10)
    expect(out.endsWith("…")).toBe(true)
  })
})

describe("notificationSummary", () => {
  test("formats mention reply like and reaction copy", () => {
    expect(
      notificationSummary(
        note({ kind: "mention", actor_name: "Ada", image_name: "Wall" })
      )
    ).toBe("Ada mentioned you on Wall")
    expect(
      notificationSummary(
        note({ kind: "reply", actor_name: "Ada", image_name: "Wall" })
      )
    ).toBe("Ada replied to your comment on Wall")
    expect(
      notificationSummary(
        note({ kind: "comment_like", actor_name: "Ada", image_name: "Wall" })
      )
    ).toBe("Ada liked your comment on Wall")
    expect(
      notificationSummary(
        note({ kind: "reaction", actor_name: "Ada", image_name: "Wall" })
      )
    ).toBe("Ada reacted to Wall")
  })
})
