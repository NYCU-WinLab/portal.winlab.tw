"use client"

import { ChevronDown, ChevronUp, Megaphone, Send } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import { createClient } from "@/lib/supabase/client"
import { parseMentions } from "@/lib/bulletin/types"

import type {
  BulletinChatInitialMessage,
  BulletinChatMember,
} from "./bulletin-chat-types"

interface ChatMessage extends BulletinChatInitialMessage {}

interface Props {
  currentUserId: string
  isAdmin: boolean
  initialMessages: ChatMessage[]
  members: BulletinChatMember[]
}

export function BulletinChatClient({
  currentUserId,
  isAdmin,
  initialMessages,
  members,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState("")
  const [broadcast, setBroadcast] = useState(false)
  const [sending, setSending] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // IME composition flag — Safari sometimes gets `e.nativeEvent.isComposing`
  // wrong, so track it ourselves via the composition events.
  const isComposingRef = useRef(false)

  // ---------------------------------------------------------------------------
  // Hydrate-and-append helper used by BOTH the realtime handler and the
  // post-send path so the sender sees their own message even if the realtime
  // channel hiccups.
  // ---------------------------------------------------------------------------
  async function hydrateAndAppend(id: string) {
    const supabase = createClient()
    const { data } = await supabase
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
      .eq("id", id)
      .maybeSingle()
    if (!data) return null
    interface Row {
      id: string
      content: string
      is_broadcast: boolean
      created_at: string
      user_profiles: BulletinChatMember | null
      bulletin_message_mentions: Array<{
        user_profiles: BulletinChatMember | null
      }>
    }
    const r = data as unknown as Row
    const hydrated: ChatMessage = {
      id: r.id,
      content: r.content,
      isBroadcast: r.is_broadcast,
      createdAt: r.created_at,
      author: r.user_profiles ?? { id: "", name: null, email: null },
      mentions: r.bulletin_message_mentions
        .map((x) => x.user_profiles)
        .filter((m): m is BulletinChatMember => Boolean(m)),
    }
    let added = false
    setMessages((prev) => {
      if (prev.some((m) => m.id === hydrated.id)) return prev
      added = true
      return [...prev, hydrated]
    })
    return { hydrated, added }
  }

  // ---------------------------------------------------------------------------
  // Realtime subscription — listen for new messages from other clients
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("bulletin-chat")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bulletin_messages",
        },
        async (payload) => {
          const newId = (payload.new as { id: string }).id
          const result = await hydrateAndAppend(newId)
          if (!result || !result.added) return
          // Bump unread when collapsed and the new message isn't ours
          if (result.hydrated.author.id !== currentUserId) {
            setExpanded((wasExpanded) => {
              if (!wasExpanded) setUnreadCount((c) => c + 1)
              return wasExpanded
            })
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // Intentionally only subscribe once; access via functional updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages.length])

  // ---------------------------------------------------------------------------
  // @mention autocomplete — track the token under the cursor
  // ---------------------------------------------------------------------------
  function handleDraftChange(value: string) {
    setDraft(value)
    const cursor = textareaRef.current?.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const match = before.match(/@([\p{L}\p{N}._-]*)$/u)
    setMentionQuery(match?.[1] ?? null)
  }

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return members
      .filter((m) => (m.name ?? "").toLowerCase().includes(q))
      .slice(0, 6)
  }, [mentionQuery, members])

  function applyMention(member: BulletinChatMember) {
    if (!member.name) return
    const cursor = textareaRef.current?.selectionStart ?? draft.length
    const before = draft.slice(0, cursor).replace(/@[\p{L}\p{N}._-]*$/u, "")
    const after = draft.slice(cursor)
    const next = `${before}@${member.name} ${after}`
    setDraft(next)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const pos = before.length + member.name!.length + 2
      textareaRef.current?.setSelectionRange(pos, pos)
    })
  }

  async function handleSend() {
    const trimmed = draft.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const res = await fetch("/api/bulletin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          is_broadcast: isAdmin && broadcast,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      const body = (await res.json()) as { id?: string }
      setDraft("")
      setBroadcast(false)
      setMentionQuery(null)
      // Optimistically render our own message right away — realtime
      // sometimes lags or drops the local echo. hydrateAndAppend dedups
      // against any later realtime event for the same id.
      if (body.id) {
        await hydrateAndAppend(body.id)
        // Auto-expand so the sender sees what they just posted
        setExpanded(true)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "送出失敗")
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Block Enter while IME composition is active (Chinese/Japanese/Korean
    // input). Check both our own ref (most reliable) and the standard flags.
    const composing =
      isComposingRef.current || e.nativeEvent.isComposing || e.keyCode === 229
    if (e.key === "Enter" && !e.shiftKey && !composing) {
      e.preventDefault()
      handleSend()
    }
  }

  // ---------------------------------------------------------------------------
  // Visual split: broadcasts pinned to top, regular chat below
  // ---------------------------------------------------------------------------
  const broadcasts = messages.filter((m) => m.isBroadcast)
  const regular = messages.filter((m) => !m.isBroadcast)

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev
      if (next) setUnreadCount(0)
      return next
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          聊天室
          {broadcasts.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <Megaphone className="size-2.5" />
              {broadcasts.length} 則公告
            </span>
          )}
          {!expanded && unreadCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              {unreadCount} 則新訊息
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )}
      </button>

      {!expanded && broadcasts.length > 0 && (
        <div className="flex flex-col gap-2">
          {broadcasts.slice(-2).map((m) => (
            <BroadcastBanner key={m.id} message={m} />
          ))}
        </div>
      )}

      {expanded && (
        <>
          <div
            ref={listRef}
            className="flex max-h-[480px] flex-col gap-3 overflow-y-auto rounded-xl border border-border p-3"
          >
            {broadcasts.map((m) => (
              <BroadcastBanner key={m.id} message={m} />
            ))}

            {regular.length === 0 && broadcasts.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                還沒有人發言。第一個說話吧。
              </p>
            ) : (
              regular.map((m) => (
                <ChatBubble
                  key={m.id}
                  message={m}
                  isOwn={m.author.id === currentUserId}
                />
              ))
            )}
          </div>

          <div className="relative flex flex-col gap-2 rounded-xl border border-border p-2">
            {filteredMembers.length > 0 && (
              <div className="absolute right-0 bottom-full left-0 mb-1 flex max-h-48 flex-col overflow-y-auto rounded-xl border border-border bg-popover shadow-md">
                {filteredMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => applyMention(m)}
                    className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Avatar className="size-5">
                      <AvatarFallback className="text-[10px]">
                        {(m.name ?? "?").slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{m.name ?? m.email}</span>
                  </button>
                ))}
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={draft}
              rows={2}
              placeholder={
                broadcast
                  ? "輸入廣播公告（會寄信給全體成員）…"
                  : "說點什麼…  輸入 @ 提到別人會寄信通知"
              }
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => {
                isComposingRef.current = true
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false
              }}
              className="resize-none border-0 px-2 shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-2">
              {isAdmin ? (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={broadcast}
                    onChange={(e) => setBroadcast(e.target.checked)}
                    className="size-3.5"
                  />
                  <Megaphone className="size-3" />
                  廣播（寄信給全部人）
                </label>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                disabled={sending || !draft.trim()}
                onClick={handleSend}
                className="gap-1"
              >
                <Send className="size-3" />
                送出
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

function BroadcastBanner({ message }: { message: ChatMessage }) {
  return (
    <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 dark:border-amber-700/60 dark:bg-amber-950/30">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
        <Megaphone className="size-3" />
        公告
        <span className="ml-auto font-normal text-amber-700/70 dark:text-amber-300/70">
          {formatTime(message.createdAt)} · {message.author.name ?? "?"}
        </span>
      </div>
      <p className="mt-1 text-sm whitespace-pre-wrap">
        <FormattedContent content={message.content} />
      </p>
    </div>
  )
}

function ChatBubble({
  message,
  isOwn,
}: {
  message: ChatMessage
  isOwn: boolean
}) {
  const initial = (message.author.name ?? "?").slice(0, 1).toUpperCase()
  return (
    <div
      className={cn(
        "flex items-start gap-2",
        isOwn ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar className="size-7 shrink-0">
        <AvatarFallback className="text-[11px]">{initial}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex max-w-[75%] flex-col gap-0.5",
          isOwn ? "items-end" : "items-start"
        )}
      >
        <div className="text-[10px] text-muted-foreground">
          {message.author.name ?? "?"} · {formatTime(message.createdAt)}
        </div>
        <div
          className={cn(
            "rounded-2xl px-3 py-1.5 text-sm",
            isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          <p className="break-words whitespace-pre-wrap">
            <FormattedContent content={message.content} />
          </p>
        </div>
      </div>
    </div>
  )
}

function FormattedContent({ content }: { content: string }) {
  const mentions = new Set(parseMentions(content))
  if (mentions.size === 0) return <>{content}</>

  // Split on @name tokens, keeping the delimiter
  const parts = content.split(/(@[\p{L}\p{N}._-]+)/gu)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@") && mentions.has(part.slice(1))) {
          return (
            <span
              key={i}
              className="rounded bg-blue-500/15 px-1 py-0.5 text-blue-700 dark:text-blue-300"
            >
              {part}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
