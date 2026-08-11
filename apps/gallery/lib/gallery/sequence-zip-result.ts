/** Toast title after a sequence/story ZIP finishes downloading. */
export function describeSequenceZipSaved(count: number): string {
  return `Saved ${count} shot${count === 1 ? "" : "s"} as ZIP`
}
