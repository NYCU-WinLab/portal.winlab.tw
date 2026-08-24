export function remainingSeconds(
  questionStartedAt: string,
  timeLimitSeconds: number,
  now: Date
): number {
  const elapsedSeconds = Math.max(
    0,
    (now.getTime() - new Date(questionStartedAt).getTime()) / 1000
  )
  return Math.max(0, Math.ceil(timeLimitSeconds - elapsedSeconds))
}
