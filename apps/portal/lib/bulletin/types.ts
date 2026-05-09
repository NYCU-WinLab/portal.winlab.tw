export interface Announcement {
  id: string
  title: string
  content: string
  tags: string[]
  pinned: boolean
  createdAt: string
  updatedAt: string
  notifiedAt: string | null
}

export interface DbAnnouncement {
  id: string
  title: string
  content: string
  tags: string[]
  is_published: boolean
  pinned: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  notified_at: string | null
}

export function toAnnouncement(row: DbAnnouncement): Announcement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags,
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notifiedAt: row.notified_at,
  }
}

// =============================================================================
// Chat messages
// =============================================================================

export interface DbBulletinMessage {
  id: string
  content: string
  author_id: string
  is_broadcast: boolean
  broadcast_notified_at: string | null
  created_at: string
}

export interface BulletinMessageAuthor {
  id: string
  name: string | null
  email: string | null
}

export interface BulletinMessage {
  id: string
  content: string
  author: BulletinMessageAuthor
  isBroadcast: boolean
  mentions: BulletinMessageAuthor[]
  createdAt: string
}

export interface DbBulletinMention {
  message_id: string
  mentioned_user_id: string
  notified_at: string | null
}

/**
 * Parse @mentions from a message body.
 * Mentions look like `@name`. We accept letters, digits, dots, hyphens, and
 * underscores in the name; matching against the directory is done by the
 * caller (so admins of the user list can change names freely).
 */
export function parseMentions(content: string): string[] {
  const matches = content.matchAll(/@([\p{L}\p{N}._-]{1,40})/gu)
  const names = new Set<string>()
  for (const m of matches) {
    if (m[1]) names.add(m[1])
  }
  return Array.from(names)
}
