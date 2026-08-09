import { describe, expect, test } from "bun:test"

import { isGalleryAlbumsReady } from "@/lib/gallery/albums"
import { isGalleryFavoritesReady } from "@/lib/gallery/favorites"
import {
  isGalleryPinReady,
  isGalleryVideoReady,
} from "@/lib/gallery/manage-uploads"
import { isGalleryTagsReady } from "@/lib/gallery/tags"

function mockClient(error: { code?: string; message?: string } | null) {
  return {
    from() {
      return {
        select() {
          return {
            limit() {
              return Promise.resolve({ error })
            },
          }
        },
      }
    },
  } as never
}

describe("readiness probes", () => {
  test("isGalleryFavoritesReady is true when query succeeds", async () => {
    expect(await isGalleryFavoritesReady(mockClient(null))).toBe(true)
  })

  test("isGalleryFavoritesReady is false when table is missing", async () => {
    expect(
      await isGalleryFavoritesReady(
        mockClient({
          code: "PGRST205",
          message: "Could not find the table 'public.gallery_favorites'",
        })
      )
    ).toBe(false)
  })

  test("isGalleryTagsReady is false when table is missing", async () => {
    expect(
      await isGalleryTagsReady(
        mockClient({
          code: "PGRST205",
          message: "Could not find the table 'public.gallery_tags'",
        })
      )
    ).toBe(false)
  })

  test("isGalleryAlbumsReady is false when table is missing", async () => {
    expect(
      await isGalleryAlbumsReady(
        mockClient({
          code: "PGRST205",
          message: "Could not find the table 'public.gallery_albums'",
        })
      )
    ).toBe(false)
  })

  test("isGalleryPinReady is false when pinned_at is missing", async () => {
    expect(
      await isGalleryPinReady(
        mockClient({
          code: "PGRST204",
          message: "Could not find the 'pinned_at' column",
        })
      )
    ).toBe(false)
  })

  test("isGalleryVideoReady is false when media_type is missing", async () => {
    expect(
      await isGalleryVideoReady(
        mockClient({
          code: "PGRST204",
          message: "Could not find the 'media_type' column in the schema cache",
        })
      )
    ).toBe(false)
  })

  test("readiness stays true for unrelated permission errors", async () => {
    expect(
      await isGalleryFavoritesReady(
        mockClient({
          message: "permission denied for table gallery_favorites",
        })
      )
    ).toBe(true)
  })
})
