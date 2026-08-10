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

/** aria-label for previous photo in album/Memories lightbox. */
export function describePreviousPhotoAriaLabel(): string {
  return "Previous photo"
}

/** aria-label for next photo in album/Memories lightbox. */
export function describeNextPhotoAriaLabel(): string {
  return "Next photo"
}
