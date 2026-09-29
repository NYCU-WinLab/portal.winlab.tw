import type { SupabaseClient } from "@supabase/supabase-js"

import type { DbAnnouncement } from "@/lib/bulletin/types"

export interface AnnouncementInput {
  title: string
  content: string
  tags: string[]
  pinned: boolean
  createdBy?: string
  // The notifier script mails every published announcement whose notified_at
  // is null. Setting it at insert is how a post goes up without that mail.
  notifiedAt?: string
}

// RLS lets only portal admins write announcements, so anyone else's insert
// fails here with a row-level security error.
export async function createAnnouncement(
  supabase: SupabaseClient,
  input: AnnouncementInput
): Promise<DbAnnouncement> {
  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title: input.title,
      content: input.content,
      tags: input.tags,
      pinned: input.pinned,
      ...(input.createdBy ? { created_by: input.createdBy } : {}),
      ...(input.notifiedAt ? { notified_at: input.notifiedAt } : {}),
    })
    .select("*")
    .single()
  if (error) throw error
  return data as DbAnnouncement
}

// Null when nothing was deleted. RLS hides every row from a non-admin's
// delete, so an unknown id and a missing permission both come back as null
// rather than as an error.
export async function deleteAnnouncement(
  supabase: SupabaseClient,
  id: string
): Promise<Pick<DbAnnouncement, "id" | "title"> | null> {
  const { data, error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", id)
    .select("id, title")
    .maybeSingle()
  if (error) throw error
  return (data as Pick<DbAnnouncement, "id" | "title"> | null) ?? null
}
