export function describeReactTriggerAriaLabel(
  myReactionEmoji: string | null
): string {
  if (myReactionEmoji) {
    return `Your reaction ${myReactionEmoji}. ArrowUp or Alt+Enter for more`
  }
  return "React. ArrowUp or Alt+Enter for more"
}
