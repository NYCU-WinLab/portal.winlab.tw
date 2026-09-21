import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  fetchAnnouncement,
  fetchAnnouncements,
  fetchBulletinMessages,
  fetchMemberNames,
  insertBulletinMessage,
} from "@/lib/bulletin/fetch"
import { parseMentions, toAnnouncement } from "@/lib/bulletin/types"
import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"

const EXCERPT_LENGTH = 200

// The web composer sets no maximum and the table only rejects an empty body,
// so this cap exists to stop an agent pasting a whole document into a chat
// room the entire lab reads.
const MESSAGE_MAX_LENGTH = 2000

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

  server.registerTool(
    "list_bulletin_messages",
    {
      title: "List bulletin messages",
      description:
        "Recent messages from the lab chat room that floats on every portal page, oldest first within the window, each with its author, body, mentioned members and whether it was an admin broadcast. Every member reads the whole room, so this is lab-wide conversation and not a private thread.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(30),
      }),
    },
    async ({ limit }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const messages = await fetchBulletinMessages(supabase, limit)
        return json({
          count: messages.length,
          url: PORTAL_URL,
          messages: messages.map((m) => ({
            id: m.id,
            author: m.author.name,
            author_id: m.author.id,
            content: m.content,
            is_broadcast: m.isBroadcast,
            mentions: m.mentions
              .map((x) => x.name)
              .filter((name): name is string => !!name),
            created_at: m.createdAt,
          })),
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "post_bulletin_message",
    {
      title: "Post bulletin message",
      description:
        "Post one message to the lab chat room as the member, signed with their name and visible to everyone in the lab the moment it lands. Show the member the exact text and get an explicit yes before calling this; never send a paraphrase or an agent's own words. It always posts a normal message, never an admin broadcast, and an @name in the text is plain text here: it will not notify that person, so say so and point the member at the portal chat box when the mention has to reach someone.",
      inputSchema: z.object({
        content: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
      }),
    },
    async ({ content }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const message = await insertBulletinMessage(supabase, {
          content,
          authorId: caller.userId,
          isBroadcast: false,
        })
        return json({
          id: message.id,
          content: message.content,
          is_broadcast: message.is_broadcast,
          created_at: message.created_at,
          mentions_in_text: parseMentions(message.content),
          mentions_notified: false,
          url: PORTAL_URL,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
