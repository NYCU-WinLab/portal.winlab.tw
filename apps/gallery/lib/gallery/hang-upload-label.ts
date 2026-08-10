/** Idle submit label for the upload form. */
export function describeHangUploadLabel(input: {
  fileCount: number
  sequencesAvailable: boolean
}): string {
  const { fileCount, sequencesAvailable } = input
  if (fileCount > 1) {
    return sequencesAvailable
      ? `Hang sequence (${fileCount})`
      : `Hang ${fileCount} shots`
  }
  return "Hang on the wall"
}
