export interface BulletinChatMember {
  id: string
  name: string | null
  email: string | null
}

export interface BulletinChatInitialMessage {
  id: string
  content: string
  isBroadcast: boolean
  createdAt: string
  author: BulletinChatMember
  mentions: BulletinChatMember[]
}
