// Pure paging loop for GitLab list endpoints, kept apart from client.ts so it
// can be tested without the `server-only` import or a network.

export type PageRead =
  | { ok: true; body: unknown }
  | { ok: false; detail: string; status?: number }

// 50 pages of 100 is far past any group the lab has. A GitLab that keeps
// returning full pages past that is misbehaving, and a booking should fail
// rather than hang on it.
export const MAX_PAGES = 50

/**
 * Reads every page of a GitLab list, stopping at the first short page.
 *
 * `pageSize` must be the `per_page` the caller put in its URL. Comparing a
 * page against some other size either stops early (dropping rows) or asks
 * for a page that was never going to exist.
 */
export async function collectPages(
  pageSize: number,
  readPage: (page: number) => Promise<PageRead>
): Promise<PageRead> {
  const rows: unknown[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const read = await readPage(page)
    if (!read.ok) return read
    if (!Array.isArray(read.body)) {
      return { ok: false, detail: "GitLab 回應不是清單" }
    }
    rows.push(...read.body)
    if (read.body.length < pageSize) return { ok: true, body: rows }
  }
  return { ok: false, detail: `GitLab 清單超過 ${MAX_PAGES} 頁，已停止讀取` }
}
