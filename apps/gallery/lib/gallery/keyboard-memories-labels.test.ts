import { describe, expect, test } from "bun:test"

import {
  describeChooseCalendarDayAriaLabel,
  describeCloseShortcutsAriaLabel,
  describeKeyboardShortcutsAriaLabel,
  describeNextDayAriaLabel,
  describePreviousDayAriaLabel,
} from "@/lib/gallery/keyboard-memories-labels"

describe("keyboard and memories day labels", () => {
  test("cheatsheet aria-labels", () => {
    expect(describeKeyboardShortcutsAriaLabel()).toBe("Keyboard shortcuts")
    expect(describeCloseShortcutsAriaLabel()).toBe("Close shortcuts")
  })

  test("memories day navigator aria-labels", () => {
    expect(describeChooseCalendarDayAriaLabel()).toBe("Choose a calendar day")
    expect(describePreviousDayAriaLabel()).toBe("Previous day")
    expect(describeNextDayAriaLabel()).toBe("Next day")
  })
})
