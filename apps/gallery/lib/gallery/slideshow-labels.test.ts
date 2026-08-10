import { describe, expect, test } from "bun:test"

import {
  describeCloseSlideshowAriaLabel,
  describeNextPhotoAriaLabel,
  describeNextSlideAriaLabel,
  describePreviousPhotoAriaLabel,
  describePreviousSlideAriaLabel,
  describeSlideshowIntervalAnnouncement,
  describeSlideshowMuteAnnouncement,
  describeSlideshowMuteAriaLabel,
  describeSlideshowPlaybackAriaLabel,
  describeSlideshowProgressAriaLabel,
  syncSlideshowVideoPlayback,
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

  test("live-region mute and interval announcements", () => {
    expect(describeSlideshowMuteAnnouncement(true)).toBe("muted")
    expect(describeSlideshowMuteAnnouncement(false)).toBe("unmuted")
    expect(describeSlideshowIntervalAnnouncement(3000)).toBe(
      "3 seconds per slide"
    )
    expect(describeSlideshowIntervalAnnouncement(2500)).toBe(
      "2.5 seconds per slide"
    )
  })

  test("syncSlideshowVideoPlayback pauses and plays", () => {
    const calls: string[] = []
    const video = {
      pause: () => {
        calls.push("pause")
      },
      play: () => {
        calls.push("play")
        return Promise.resolve()
      },
    }
    syncSlideshowVideoPlayback(null, true)
    expect(calls).toEqual([])
    syncSlideshowVideoPlayback(video, true)
    syncSlideshowVideoPlayback(video, false)
    expect(calls).toEqual(["pause", "play"])
  })
})
