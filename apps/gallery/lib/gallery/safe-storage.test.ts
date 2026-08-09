import { describe, expect, test } from "bun:test"

import { readStorageItem, writeStorageItem } from "@/lib/gallery/safe-storage"

describe("safe storage helpers", () => {
  test("reads and writes when storage works", () => {
    const map = new Map<string, string>()
    const storage = {
      getItem(key: string) {
        return map.get(key) ?? null
      },
      setItem(key: string, value: string) {
        map.set(key, value)
      },
    }
    expect(writeStorageItem(storage, "k", "1")).toBe(true)
    expect(readStorageItem(storage, "k")).toBe("1")
  })

  test("soft-fails when getItem throws", () => {
    const storage = {
      getItem() {
        throw new Error("SecurityError")
      },
    }
    expect(readStorageItem(storage, "k")).toBeNull()
  })

  test("soft-fails when setItem throws", () => {
    const storage = {
      setItem() {
        throw new Error("QuotaExceededError")
      },
    }
    expect(writeStorageItem(storage, "k", "1")).toBe(false)
  })

  test("handles missing storage", () => {
    expect(readStorageItem(null, "k")).toBeNull()
    expect(writeStorageItem(undefined, "k", "1")).toBe(false)
  })
})
