/** Next index for a horizontal ARIA radiogroup (wraps at ends). */
export function nextRadioIndex(
  current: number,
  length: number,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End"
): number {
  if (length <= 0) return 0
  const clamped = Math.min(Math.max(current, 0), length - 1)
  switch (key) {
    case "Home":
      return 0
    case "End":
      return length - 1
    case "ArrowLeft":
    case "ArrowUp":
      return (clamped - 1 + length) % length
    case "ArrowRight":
    case "ArrowDown":
      return (clamped + 1) % length
  }
}
