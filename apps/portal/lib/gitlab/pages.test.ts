import { describe, expect, test } from "bun:test"

import { collectPages, type PageRead } from "./pages"

function pagesOf(...pages: unknown[][]) {
  const asked: number[] = []
  const readPage = async (page: number): Promise<PageRead> => {
    asked.push(page)
    return { ok: true, body: pages[page - 1] ?? [] }
  }
  return { asked, readPage }
}

describe("collectPages", () => {
  test("keeps reading while pages come back full", async () => {
    const { asked, readPage } = pagesOf([1, 2], [3, 4], [5])
    const read = await collectPages(2, readPage)
    expect(read).toEqual({ ok: true, body: [1, 2, 3, 4, 5] })
    expect(asked).toEqual([1, 2, 3])
  })

  test("a full last page costs one extra, empty read", async () => {
    const { asked, readPage } = pagesOf([1, 2], [3, 4])
    const read = await collectPages(2, readPage)
    expect(read).toEqual({ ok: true, body: [1, 2, 3, 4] })
    expect(asked).toEqual([1, 2, 3])
  })

  test("stops on the caller's page size, not some other one", async () => {
    const { asked, readPage } = pagesOf([1, 2, 3], [4])
    const read = await collectPages(3, readPage)
    expect(read).toEqual({ ok: true, body: [1, 2, 3, 4] })
    expect(asked).toEqual([1, 2])
  })

  test("a failed page fails the whole read", async () => {
    const read = await collectPages(1, async (page) =>
      page === 1
        ? { ok: true, body: [1] }
        : { ok: false, detail: "GitLab 回應 500", status: 500 }
    )
    expect(read).toEqual({ ok: false, detail: "GitLab 回應 500", status: 500 })
  })

  test("a non-list body is an error, not an empty list", async () => {
    const read = await collectPages(100, async () => ({
      ok: true,
      body: { message: "nope" },
    }))
    expect(read.ok).toBe(false)
  })
})
