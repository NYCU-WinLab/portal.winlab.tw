import { describe, expect, test } from "bun:test"

import { loadLightboxSocial } from "@/lib/gallery/lightbox-social"

function mockClient(opts: {
  voteError?: { code?: string; message?: string } | null
  voteRows?: Array<{ image_id: string; user_id: string; reaction: string }>
}) {
  return {
    from(table: string) {
      if (table === "gallery_image_votes") {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({
                  data: opts.voteError ? null : (opts.voteRows ?? []),
                  error: opts.voteError ?? null,
                })
              },
            }
          },
        }
      }
      if (table === "gallery_comments") {
        return {
          select() {
            return {
              in() {
                return {
                  order() {
                    return Promise.resolve({ data: [], error: null })
                  },
                }
              },
            }
          },
        }
      }
      if (table === "gallery_comment_likes") {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({ data: [], error: null })
              },
            }
          },
        }
      }
      if (table === "user_profiles") {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({ data: [], error: null })
              },
            }
          },
        }
      }
      return {
        select() {
          return {
            in() {
              return {
                order() {
                  return Promise.resolve({ data: [], error: null })
                },
              }
            },
          }
        },
      }
    },
  }
}

describe("loadLightboxSocial", () => {
  test("soft-fails reactions when the votes table is missing", async () => {
    const result = await loadLightboxSocial(
      mockClient({
        voteError: {
          code: "PGRST205",
          message:
            "Could not find the table 'public.gallery_image_votes' in the schema cache",
        },
      }) as never,
      "img-1",
      "user-1"
    )
    expect(result.reactionsAvailable).toBe(false)
    expect(result.my_reaction).toBeNull()
  })

  test("soft-fails reactions on unexpected vote query errors", async () => {
    const result = await loadLightboxSocial(
      mockClient({
        voteError: { code: "57014", message: "canceling statement" },
      }) as never,
      "img-1",
      "user-1"
    )
    expect(result.reactionsAvailable).toBe(false)
  })

  test("keeps reactions when the vote query succeeds", async () => {
    const result = await loadLightboxSocial(
      mockClient({
        voteRows: [
          {
            image_id: "img-1",
            user_id: "user-1",
            reaction: "love",
          },
        ],
      }) as never,
      "img-1",
      "user-1"
    )
    expect(result.reactionsAvailable).toBe(true)
    expect(result.my_reaction).toBe("love")
  })
})
