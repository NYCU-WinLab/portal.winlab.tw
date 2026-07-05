export type LightboxNavStep = "sequence" | "wall" | "sequence-wrap"

export function resolveLightboxPrevStep(
  activeIndex: number,
  sequenceLength: number,
  hasWallPrev: boolean
): LightboxNavStep {
  const isSequence = sequenceLength > 1
  if (isSequence && activeIndex > 0) return "sequence"
  if (hasWallPrev) return "wall"
  if (isSequence) return "sequence-wrap"
  return "wall"
}

export function resolveLightboxNextStep(
  activeIndex: number,
  sequenceLength: number,
  hasWallNext: boolean
): LightboxNavStep {
  const isSequence = sequenceLength > 1
  if (isSequence && activeIndex < sequenceLength - 1) return "sequence"
  if (hasWallNext) return "wall"
  if (isSequence) return "sequence-wrap"
  return "wall"
}

export function nextSequenceIndex(
  activeIndex: number,
  sequenceLength: number,
  direction: "prev" | "next"
): number {
  if (sequenceLength <= 1) return 0
  if (direction === "prev") {
    return activeIndex === 0 ? sequenceLength - 1 : activeIndex - 1
  }
  return (activeIndex + 1) % sequenceLength
}
