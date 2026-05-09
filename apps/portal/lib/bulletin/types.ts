export interface Announcement {
  id: string
  title: string
  content: string
  tags: string[]
  pinned: boolean
  createdAt: string
  updatedAt: string
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
  }
}
