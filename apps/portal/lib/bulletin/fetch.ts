import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  BulletinMessage,
  BulletinMessageAuthor,
  DbAnnouncement,
  DbBulletinMessage,
} from "@/lib/bulletin/types"

export const ANNOUNCEMENT_BOARD_LIMIT = 10
export const BULLETIN_CHAT_PAGE_SIZE = 50

const MESSAGE_SELECT = `
  id,
  content,
  is_broadcast,
  created_at,
  user_profiles!bulletin_messages_author_id_fkey(id, name, email),
  bulletin_message_mentions(
    user_profiles!bulletin_message_mentions_mentioned_user_id_fkey(id, name, email)
  )
`

interface MessageRow {
  id: string
  content: string
  is_broadcast: boolean
  created_at: string
  user_profiles: BulletinMessageAuthor | null
  bulletin_message_mentions: Array<{
    user_profiles: BulletinMessageAuthor | null
  }>
}

export async function fetchAnnouncements(
  supabase: SupabaseClient,
  options: { limit?: number; tag?: string } = {}
): Promise<DbAnnouncement[]> {
  const query = supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? ANNOUNCEMENT_BOARD_LIMIT)
  if (options.tag) query.contains("tags", [options.tag])

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as DbAnnouncement[]
}

// The is_published filter is not redundant with RLS: portal admins may read
// drafts, and a draft is not something the board or a tool should show.
export async function fetchAnnouncement(
  supabase: SupabaseClient,
  id: string
): Promise<DbAnnouncement | null> {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle()
  if (error) throw error
  return (data as DbAnnouncement | null) ?? null
}

// Newest rows are the interesting ones, but a chat reads oldest-first, so the
// window is taken with created_at desc and then reversed.
export async function fetchBulletinMessages(
  supabase: SupabaseClient,
  limit = BULLETIN_CHAT_PAGE_SIZE
): Promise<BulletinMessage[]> {
  const { data, error } = await supabase
    .from("bulletin_messages")
    .select(MESSAGE_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error

  return (data ?? [])
    .map((raw) => {
      const r = raw as unknown as MessageRow
      return {
        id: r.id,
        content: r.content,
        isBroadcast: r.is_broadcast,
        createdAt: r.created_at,
        author: r.user_profiles ?? { id: "", name: null, email: null },
        mentions: r.bulletin_message_mentions
          .map((m) => m.user_profiles)
          .filter((m): m is BulletinMessageAuthor => Boolean(m)),
      }
    })
    .reverse()
}

// RLS decides who may broadcast: the insert policy accepts is_broadcast=true
// only from a portal admin, so the database is the gate, not the caller.
export async function insertBulletinMessage(
  supabase: SupabaseClient,
  message: { content: string; authorId: string; isBroadcast: boolean }
): Promise<DbBulletinMessage> {
  const { data, error } = await supabase
    .from("bulletin_messages")
    .insert({
      content: message.content,
      author_id: message.authorId,
      is_broadcast: message.isBroadcast,
    })
    .select(
      "id, content, author_id, is_broadcast, broadcast_notified_at, created_at"
    )
    .single()
  if (error) throw error
  if (!data) throw new Error("Failed to insert message")
  return data as DbBulletinMessage
}

export async function fetchMemberNames(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)]
  const names = new Map<string, string | null>()
  if (unique.length === 0) return names

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, name")
    .in("id", unique)
  if (error) throw error
  for (const p of (data ?? []) as { id: string; name: string | null }[]) {
    names.set(p.id, p.name)
  }
  return names
}
