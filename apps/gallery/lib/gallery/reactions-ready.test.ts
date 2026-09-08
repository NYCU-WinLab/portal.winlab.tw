import { describe, expect, test } from "bun:test"

import {
  isGalleryReactionsReady,
  isGalleryReactionsUnavailable,
} from "@/lib/gallery/reactions"

describe("isGalleryReactionsUnavailable", () => {
  test("detects missing votes table", () => {
    expect(
      isGalleryReactionsUnavailable({
        code: "PGRST205",
        message:
          "Could not find the table 'public.gallery_image_votes' in the schema cache",
      })
    ).toBe(true)
  })

  test("ignores permission errors", () => {
    expect(
      isGalleryReactionsUnavailable({
        message: "permission denied for table gallery_image_votes",
      })
    ).toBe(false)
  })
})

describe("isGalleryReactionsReady", () => {
  test("is false when votes table is missing", async () => {
    const client = {
      from() {
        return {
          select() {
            return {
              limit() {
                return Promise.resolve({
                  error: {
                    code: "PGRST205",
                    message:
                      "Could not find the table 'public.gallery_image_votes'",
                  },
                })
              },
            }
          },
        }
      },
    } as never
    expect(await isGalleryReactionsReady(client)).toBe(false)
  })

  test("is true when the query succeeds", async () => {
    const client = {
      from() {
        return {
          select() {
            return {
              limit() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    } as never
    expect(await isGalleryReactionsReady(client)).toBe(true)
  })
})
