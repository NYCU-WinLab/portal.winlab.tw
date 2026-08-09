/** Pure visibility rule for the "jump to top" affordance. */

/**
 * Show the jump-to-top control once the reader has scrolled well past the
 * first screen — roughly 1.5 viewports down — so it never crowds the hero.
 */
export function shouldShowJumpToTop(
  scrollY: number,
  viewportHeight: number
): boolean {
  if (!Number.isFinite(scrollY) || !Number.isFinite(viewportHeight)) {
    return false
  }
  const threshold = Math.max(viewportHeight * 1.5, 600)
  return scrollY > threshold
}
