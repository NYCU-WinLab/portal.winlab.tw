/** True when keyboard events should stay in a form field, not drive wall/lightbox nav. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false
  const el = target as {
    tagName?: string
    isContentEditable?: boolean
    closest?: (selector: string) => Element | null
  }
  const tag = el.tagName
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    Boolean(el.isContentEditable)
  ) {
    return true
  }
  // Native video controls need ←/→ for seek — do not steal them.
  if (tag === "VIDEO" || tag === "AUDIO") return true
  if (typeof el.closest === "function" && el.closest("video, audio")) {
    return true
  }
  return false
}
