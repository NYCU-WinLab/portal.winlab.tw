import { describe, expect, test } from "bun:test"

import { escapeHtml } from "@/lib/gallery/mention-email-drain"

describe("escapeHtml", () => {
  test("escapes ampersand, angle brackets, and quotes", () => {
    expect(escapeHtml(`A & B <c> "d"`)).toBe(
      "A &amp; B &lt;c&gt; &quot;d&quot;"
    )
  })

  test("leaves plain text alone", () => {
    expect(escapeHtml("Lab night")).toBe("Lab night")
  })
})
