import { describe, expect, test } from "bun:test"

import { orNullAfter } from "./bound"

describe("orNullAfter", () => {
  test("passes a value through", async () => {
    expect(await orNullAfter(Promise.resolve(7), 50)).toBe(7)
  })
  test("a stalled promise ends as null at the bound", async () => {
    const started = Date.now()
    expect(await orNullAfter(new Promise(() => {}), 30)).toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
  })
  test("a rejection before the bound still rejects", async () => {
    await expect(
      orNullAfter(Promise.reject(new Error("x")), 50)
    ).rejects.toThrow("x")
  })
  test("a rejection after the bound is swallowed", async () => {
    const late = new Promise((_r, rej) =>
      setTimeout(() => rej(new Error("late")), 40)
    )
    expect(await orNullAfter(late, 10)).toBeNull()
    await new Promise((r) => setTimeout(r, 80))
  })
})
