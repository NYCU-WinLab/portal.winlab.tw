import { describe, expect, test } from "bun:test"

import {
  composeTopic,
  DEFAULT_TOPIC_SUFFIX,
  formatPrefix,
  sanitizeForFilename,
  topicPrefix,
} from "./meeting-topic"

describe("sanitizeForFilename", () => {
  test("keeps hyphens and spaces", () => {
    // Group slugs are full of hyphens; stripping them would break the very
    // identifier the prefix exists to carry.
    expect(sanitizeForFilename("winlab-projects-ai 週會")).toBe(
      "winlab-projects-ai 週會"
    )
  })

  test("keeps Chinese", () => {
    expect(sanitizeForFilename("實驗室週會")).toBe("實驗室週會")
  })

  test("strips characters a filename can't hold", () => {
    expect(sanitizeForFilename('a/b\\c:d*e?f"g<h>i|j')).toBe(
      "a b c d e f g h i j"
    )
  })

  test("strips the delimiter brackets", () => {
    expect(sanitizeForFilename("[spoofed] real")).toBe("spoofed real")
  })

  test("collapses the whitespace stripping leaves behind", () => {
    expect(sanitizeForFilename("a///b")).toBe("a b")
    expect(sanitizeForFilename("  padded  ")).toBe("padded")
  })
})

describe("topicPrefix", () => {
  test("prefers the group name", () => {
    expect(
      topicPrefix({
        groupName: "winlab-projects-ai",
        firstAttendeeUsername: "n0ball",
      })
    ).toBe("winlab-projects-ai")
  })

  test("prefers the group over the booker", () => {
    expect(
      topicPrefix({ groupName: "tasa-satsim", bookerUsername: "frank" })
    ).toBe("tasa-satsim")
  })

  // A personal meeting is filed under whoever booked it, the way a group
  // meeting is filed under its group. Reported 2026-10-19: a thesis meeting
  // with only the advisor invited went out with no prefix at all.
  test("files a personal meeting under the booker", () => {
    expect(topicPrefix({ bookerUsername: "frank" })).toBe("frank")
  })

  test("prefers the booker over whoever they invited", () => {
    expect(
      topicPrefix({ bookerUsername: "frank", firstAttendeeUsername: "cctseng" })
    ).toBe("frank")
  })

  test("falls back to the first attendee's username", () => {
    expect(topicPrefix({ firstAttendeeUsername: "n0ball" })).toBe("n0ball")
  })

  test("skips a booker whose username sanitises to nothing", () => {
    expect(
      topicPrefix({ bookerUsername: "  ", firstAttendeeUsername: "n0ball" })
    ).toBe("n0ball")
  })

  test("is null when there's nothing to identify the meeting by", () => {
    expect(topicPrefix({})).toBeNull()
    expect(
      topicPrefix({
        groupName: null,
        bookerUsername: null,
        firstAttendeeUsername: null,
      })
    ).toBeNull()
  })

  test("is null when sanitising leaves nothing", () => {
    expect(topicPrefix({ groupName: "///" })).toBeNull()
  })

  test("returns the bare id, without brackets", () => {
    expect(topicPrefix({ groupName: "tasa" })).toBe("tasa")
    expect(formatPrefix("tasa")).toBe("[tasa]")
  })
})

describe("composeTopic", () => {
  test("joins prefix and suffix with a hyphen", () => {
    expect(composeTopic("tasa", "討論")).toBe("[tasa]-討論")
  })

  test("keeps hyphens inside the prefix unambiguous", () => {
    // The bracket is the delimiter, so a slug full of hyphens still parses.
    expect(composeTopic("winlab-projects-ai", "週會")).toBe(
      "[winlab-projects-ai]-週會"
    )
  })

  test("emits no dangling hyphen when there's no prefix", () => {
    expect(composeTopic(null, "討論")).toBe("討論")
    expect(composeTopic(undefined, "討論")).toBe("討論")
  })

  test("falls back to the default suffix when the box is emptied", () => {
    expect(composeTopic("tasa", "")).toBe(`[tasa]-${DEFAULT_TOPIC_SUFFIX}`)
    expect(composeTopic("tasa", "   ")).toBe(`[tasa]-${DEFAULT_TOPIC_SUFFIX}`)
  })

  // The prefix is a separate stored field, so a suffix that looks like one
  // is just text — it can't change which group the recording files under.
  test("a bracketed suffix can't impersonate a prefix", () => {
    expect(composeTopic("real-group", "[other-group]-討論")).toBe(
      "[real-group]-other-group -討論"
    )
  })

  test("sanitises the suffix for the recording filename", () => {
    expect(composeTopic("tasa", "8/1 進度")).toBe("[tasa]-8 1 進度")
  })
})
