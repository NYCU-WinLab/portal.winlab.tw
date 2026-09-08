import { describe, expect, test } from "bun:test"

import {
  galleryScrollBehavior,
  prefersReducedMotion,
} from "@/lib/gallery/motion"

describe("prefersReducedMotion", () => {
  test("is false outside the browser (SSR / bun test)", () => {
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe("galleryScrollBehavior", () => {
  test("defaults to smooth when reduce is unset", () => {
    expect(galleryScrollBehavior()).toBe("smooth")
  })
})
