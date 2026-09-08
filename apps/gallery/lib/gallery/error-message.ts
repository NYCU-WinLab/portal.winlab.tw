/** Prefer Error.message; otherwise use the provided fallback copy. */
export function describeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
