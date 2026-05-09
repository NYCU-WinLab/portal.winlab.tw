import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

import { BulletinChatClient } from "./bulletin-chat-client"
import type {
  BulletinChatInitialMessage,
  BulletinChatMember,
} from "./bulletin-chat-types"

const PAGE_SIZE = 50

interface DbRow {
  id: string
  content: string
  is_broadcast: boolean
  created_at: string
  user_profiles: {
    id: string
    name: string | null
    email: string | null
  } | null
  bulletin_message_mentions: Array<{
    user_profiles: {
      id: string
      name: string | null
      email: string | null
    } | null
  }>
}

async function fetchInitial(): Promise<{
  messages: BulletinChatInitialMessage[]
  members: BulletinChatMember[]
  isAdmin: boolean
}> {
  const supabase = await createClient()

  const [{ data: messageRows }, { data: members }, { data: adminRpc }] =
    await Promise.all([
      supabase
        .from("bulletin_messages")
        .select(
          `
          id,
          content,
          is_broadcast,
          created_at,
          user_profiles!bulletin_messages_author_id_fkey(id, name, email),
          bulletin_message_mentions(
            user_profiles!bulletin_message_mentions_mentioned_user_id_fkey(id, name, email)
          )
        `
        )
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE),
      supabase
        .from("user_profiles")
        .select("id, name, email")
        .order("name", { ascending: true }),
      supabase.rpc("is_portal_admin"),
    ])

  const messages = (messageRows ?? [])
    .map((raw) => {
      const r = raw as unknown as DbRow
      return {
        id: r.id,
        content: r.content,
        isBroadcast: r.is_broadcast,
        createdAt: r.created_at,
        author: {
          id: r.user_profiles?.id ?? "",
          name: r.user_profiles?.name ?? null,
          email: r.user_profiles?.email ?? null,
        },
        mentions: r.bulletin_message_mentions
          .map((m) => m.user_profiles)
          .filter((m): m is NonNullable<typeof m> => Boolean(m))
          .map((m) => ({ id: m.id, name: m.name, email: m.email })),
      }
    })
    .reverse()

  return {
    messages,
    members: (members ?? []) as BulletinChatMember[],
    isAdmin: adminRpc === true,
  }
}

export async function BulletinChat() {
  const [user, initial] = await Promise.all([getCurrentUser(), fetchInitial()])
  if (!user) return null

  return (
    <BulletinChatClient
      currentUserId={user.id}
      isAdmin={initial.isAdmin}
      initialMessages={initial.messages}
      members={initial.members}
    />
  )
}
