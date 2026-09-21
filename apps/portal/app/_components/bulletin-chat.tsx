import { createClient } from "@/lib/supabase/server"
import { fetchBulletinMessages } from "@/lib/bulletin/fetch"
import { getCurrentUser } from "@/lib/user"

import { BulletinChatClient } from "./bulletin-chat-client"
import type {
  BulletinChatInitialMessage,
  BulletinChatMember,
} from "./bulletin-chat-types"

async function fetchInitial(): Promise<{
  messages: BulletinChatInitialMessage[]
  members: BulletinChatMember[]
  isAdmin: boolean
}> {
  const supabase = await createClient()

  const [messages, { data: members }, { data: adminRpc }] = await Promise.all([
    // The chat is a floating panel on every page: a failed history read
    // opens it empty instead of breaking the page around it.
    fetchBulletinMessages(supabase).catch(() => []),
    supabase
      .from("user_profiles")
      .select("id, name, email")
      .order("name", { ascending: true })
      .limit(500),
    supabase.rpc("is_portal_admin"),
  ])

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
