/** Whether the user prefers reduced motion (SSR-safe: false). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Scroll behavior that respects prefers-reduced-motion. */
export function galleryScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth"
}
