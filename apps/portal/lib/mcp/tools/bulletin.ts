import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  fetchAnnouncement,
  fetchAnnouncements,
  fetchMemberNames,
} from "@/lib/bulletin/fetch"
import { toAnnouncement } from "@/lib/bulletin/types"
import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"

const EXCERPT_LENGTH = 200

// Announcements are stored as markdown and the excerpt is read aloud by an
// agent, so the markers are dropped rather than rendered.
export function announcementExcerpt(
  content: string,
  max = EXCERPT_LENGTH
): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]{0,3}(?:[-*+]|\d+\.)[ \t]+/gm, "")
    .replace(/\*\*|__|~~|\*|_/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return plain.length <= max ? plain : `${plain.slice(0, max).trimEnd()}…`
}

export function registerBulletinTools(server: McpServer) {
  server.registerTool(
    "list_announcements",
    {
      title: "List announcements",
      description:
        "Published lab announcements from the portal home board (/bulletin), pinned ones first and newest first within each group, as id, title, tags, author, created_at and a plain-text excerpt of the body. Every member sees the same list, so nothing here is private to the caller; drafts are never included. Pass the id to get_announcement for the full text.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
        tag: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Only announcements carrying this tag"),
      }),
    },
    async ({ limit, tag }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const rows = await fetchAnnouncements(supabase, { limit, tag })
        const authors = await fetchMemberNames(
          supabase,
          rows.map((r) => r.created_by).filter((id): id is string => !!id)
        )
        return json({
          count: rows.length,
          announcements: rows.map((row) => {
            const a = toAnnouncement(row)
            return {
              id: a.id,
              title: a.title,
              tags: a.tags,
              pinned: a.pinned,
              author: row.created_by
                ? (authors.get(row.created_by) ?? null)
                : null,
              created_at: a.createdAt,
              excerpt: announcementExcerpt(a.content),
              url: `${PORTAL_URL}/bulletin/${a.id}`,
            }
          }),
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "get_announcement",
    {
      title: "Get announcement",
      description:
        "One published announcement in full, its body exactly as written in markdown, plus title, tags, pinned, author and timestamps. Readable by every member, the same text the /bulletin page shows. Fails when the id is unknown or the announcement is still a draft.",
      inputSchema: z.object({
        announcement_id: z
          .string()
          .trim()
          .min(1)
          .describe("Announcement id from list_announcements"),
      }),
    },
    async ({ announcement_id }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const row = await fetchAnnouncement(supabase, announcement_id)
        if (!row) {
          throw new Error(
            `no published announcement with id ${announcement_id}`
          )
        }
        const a = toAnnouncement(row)
        const authors = await fetchMemberNames(
          supabase,
          row.created_by ? [row.created_by] : []
        )
        return json({
          id: a.id,
          title: a.title,
          content: a.content,
          tags: a.tags,
          pinned: a.pinned,
          author: row.created_by ? (authors.get(row.created_by) ?? null) : null,
          created_at: a.createdAt,
          updated_at: a.updatedAt,
          url: `${PORTAL_URL}/bulletin/${a.id}`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
