import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  fetchAnnouncement,
  fetchAnnouncements,
  fetchMemberNames,
} from "@/lib/bulletin/fetch"
import {
  createAnnouncement,
  deleteAnnouncement,
} from "@/lib/bulletin/mutations"
import { toAnnouncement } from "@/lib/bulletin/types"
import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  requireAdmin,
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

// Same tag list the web dialog builds: each tag once, in the order given.
export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags)]
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

  server.registerTool(
    "create_announcement",
    {
      title: "Create announcement",
      description:
        "Posts an announcement to the lab board on the portal home page (/bulletin), the 新增公告 dialog. Portal super admins only; for anyone else the tool fails. It is published at once and every member sees it, with the caller as author. notify decides the mail: true leaves it for the lab's notifier script, which mails it to everyone as it does a web post; false posts it quietly: it is marked as already mailed (the green bell on its web page), so the script skips it. The body is markdown. Show the member the exact title, body, tags, pinned and notify choice and get their yes before calling; never write or reword the text for them unasked.",
      inputSchema: z.object({
        title: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("Headline shown on the board"),
        content: z
          .string()
          .trim()
          .min(1)
          .max(20000)
          .describe("Body in markdown, exactly as it should read"),
        tags: z
          .array(z.string().trim().min(1).max(40))
          .max(10)
          .default([])
          .describe('Labels such as "clean" or "核銷"'),
        pinned: z
          .boolean()
          .default(false)
          .describe("Keep it above the unpinned announcements"),
        notify: z
          .boolean()
          .describe(
            "true: the notifier script mails it to the lab; false: no mail"
          ),
      }),
    },
    async ({ title, content, tags, pinned, notify }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        await requireAdmin(supabase, "is_portal_admin", "post announcements")
        const row = await createAnnouncement(supabase, {
          title,
          content,
          tags: normalizeTags(tags),
          pinned,
          createdBy: caller.userId,
          notifiedAt: notify ? undefined : new Date().toISOString(),
        })
        return json({
          id: row.id,
          title: row.title,
          tags: row.tags,
          pinned: row.pinned,
          mail: row.notified_at ? "skipped" : "pending",
          created_at: row.created_at,
          url: `${PORTAL_URL}/bulletin/${row.id}`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "delete_announcement",
    {
      title: "Delete announcement",
      description:
        "Deletes one announcement from the lab board (/bulletin) for good, the trash button on its page. There is no undo, and mail already sent for it stays sent. Portal super admins only; for anyone else the tool fails. Read it with get_announcement and confirm the title with the member before calling.",
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
        await requireAdmin(supabase, "is_portal_admin", "delete announcements")
        const removed = await deleteAnnouncement(supabase, announcement_id)
        if (!removed) {
          throw new Error(
            `no announcement with id ${announcement_id}; call list_announcements for the current ids`
          )
        }
        return json({
          removed: true,
          id: removed.id,
          title: removed.title,
          url: PORTAL_URL,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
