/** Loading toast title while a ZIP download is assembling. */
export function describeZipPreparingProgress(input: {
  completed: number
  total: number
  noun: "album" | "selection" | "story"
}): string {
  const { completed, total, noun } = input
  return `Preparing ${noun}… ${completed}/${total}`
}
