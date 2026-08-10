import { describe, expect, test } from "bun:test"

import {
  describeCloseSlideshowAriaLabel,
  describeNextPhotoAriaLabel,
  describeNextSlideAriaLabel,
  describePreviousPhotoAriaLabel,
  describePreviousSlideAriaLabel,
  describeSlideshowMuteAriaLabel,
  describeSlideshowPlaybackAriaLabel,
  describeSlideshowProgressAriaLabel,
} from "@/lib/gallery/slideshow-labels"

describe("slideshow labels", () => {
  test("static chrome aria-labels", () => {
    expect(describeCloseSlideshowAriaLabel()).toBe("Close slideshow")
    expect(describeSlideshowProgressAriaLabel()).toBe("Slideshow progress")
    expect(describePreviousSlideAriaLabel()).toBe("Previous slide")
    expect(describeNextSlideAriaLabel()).toBe("Next slide")
    expect(describePreviousPhotoAriaLabel()).toBe("Previous photo")
    expect(describeNextPhotoAriaLabel()).toBe("Next photo")
  })

  test("playback and mute toggles", () => {
    expect(describeSlideshowPlaybackAriaLabel(true)).toBe("Resume slideshow")
    expect(describeSlideshowPlaybackAriaLabel(false)).toBe("Pause slideshow")
    expect(describeSlideshowMuteAriaLabel(true)).toBe("Unmute video")
    expect(describeSlideshowMuteAriaLabel(false)).toBe("Mute video")
  })
})
