/** True when keyboard events should stay in a form field, not drive wall/lightbox nav. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false
  const el = target as {
    tagName?: string
    isContentEditable?: boolean
  }
  const tag = el.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    Boolean(el.isContentEditable)
  )
}
