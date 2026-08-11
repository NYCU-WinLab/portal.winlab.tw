/** aria-label for closing the album slideshow. */
export function describeCloseSlideshowAriaLabel(): string {
  return "Close slideshow"
}

/** aria-label for the slideshow progress control. */
export function describeSlideshowProgressAriaLabel(): string {
  return "Slideshow progress"
}

/** aria-label for previous slide. */
export function describePreviousSlideAriaLabel(): string {
  return "Previous slide"
}

/** aria-label for next slide. */
export function describeNextSlideAriaLabel(): string {
  return "Next slide"
}

/** aria-label for pause / resume. */
export function describeSlideshowPlaybackAriaLabel(paused: boolean): string {
  return paused ? "Resume slideshow" : "Pause slideshow"
}

/** aria-label for mute / unmute during slideshow video. */
export function describeSlideshowMuteAriaLabel(muted: boolean): string {
  return muted ? "Unmute video" : "Mute video"
}

/** Live-region fragment for mute state. */
export function describeSlideshowMuteAnnouncement(muted: boolean): string {
  return muted ? "muted" : "unmuted"
}

/** Live-region fragment for the advance interval. */
export function describeSlideshowIntervalAnnouncement(ms: number): string {
  const seconds = ms / 1000
  const label = Number.isInteger(seconds)
    ? String(seconds)
    : String(Number(seconds.toFixed(1)))
  return `${label} seconds per slide`
}

/** Sync a media element to the slideshow paused flag. */
export function syncSlideshowVideoPlayback(
  video: { pause: () => void; play: () => Promise<void> } | null,
  paused: boolean
): void {
  if (!video) return
  if (paused) {
    video.pause()
    return
  }
  void video.play().catch(() => {
    // Autoplay may be blocked; chrome still reflects the intended state.
  })
}

/** aria-label for previous photo in album/Memories lightbox. */
export function describePreviousPhotoAriaLabel(): string {
  return "Previous photo"
}

/** aria-label for next photo in album/Memories lightbox. */
export function describeNextPhotoAriaLabel(): string {
  return "Next photo"
}
