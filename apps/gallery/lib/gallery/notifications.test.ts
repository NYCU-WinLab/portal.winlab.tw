import { describe, expect, test } from "bun:test"

import {
  isActivityNotificationsUnavailable,
  isGalleryMentionsTableUnavailable,
  isGalleryNotificationsReady,
} from "@/lib/gallery/notifications"

describe("notification readiness", () => {
  test("isActivityNotificationsUnavailable detects missing table", () => {
    expect(
      isActivityNotificationsUnavailable({
        code: "PGRST205",
        message:
          "Could not find the table 'public.gallery_activity_notifications' in the schema cache",
      })
    ).toBe(true)
  })

  test("isGalleryMentionsTableUnavailable detects missing table", () => {
    expect(
      isGalleryMentionsTableUnavailable({
        code: "PGRST205",
        message:
          "Could not find the table 'public.gallery_comment_mentions' in the schema cache",
      })
    ).toBe(true)
  })

  test("isGalleryNotificationsReady is false when both sources are missing", async () => {
    const client = {
      from(table: string) {
        return {
          select() {
            return {
              limit() {
                return Promise.resolve({
                  error: {
                    code: "PGRST205",
                    message: `Could not find the table 'public.${table}' in the schema cache`,
                  },
                })
              },
            }
          },
        }
      },
    } as never
    expect(await isGalleryNotificationsReady(client)).toBe(false)
  })

  test("isGalleryNotificationsReady is true when one source works", async () => {
    const client = {
      from(table: string) {
        return {
          select() {
            return {
              limit() {
                if (table === "gallery_activity_notifications") {
                  return Promise.resolve({ error: null })
                }
                return Promise.resolve({
                  error: {
                    code: "PGRST205",
                    message:
                      "Could not find the table 'public.gallery_comment_mentions'",
                  },
                })
              },
            }
          },
        }
      },
    } as never
    expect(await isGalleryNotificationsReady(client)).toBe(true)
  })
})
