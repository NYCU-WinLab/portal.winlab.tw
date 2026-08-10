/** User-facing copy when the infinite wall fails to fetch the next page. */
export function describeWallLoadMoreError(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load more photos."
}
