"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { IconBell } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

import { markGalleryMentionsRead } from "@/app/actions"
import {
  gallerySans,
  galleryShellIconButtonClass,
} from "@/components/gallery-chrome"
import { formatUploadedAt } from "@/lib/gallery/format-uploaded-at"
import {
  fetchGalleryMentionNotification,
  type GalleryMentionNotification,
} from "@/lib/gallery/mention-notifications"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
import { createClient } from "@/lib/supabase/client"

function truncateBody(body: string, max = 72): string {
  const trimmed = body.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function sortNotifications(items: GalleryMentionNotification[]) {
  return [...items].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export function GalleryMentionBell({
  viewerId,
  initialNotifications,
}: {
  viewerId: string
  initialNotifications: GalleryMentionNotification[]
}) {
  const router = useRouter()
  const [notifications, setNotifications] = useState(initialNotifications)
  const [isPending, startTransition] = useTransition()
  const unreadCount = notifications.length

  useEffect(() => {
    setNotifications(initialNotifications)
  }, [initialNotifications])

  useEffect(() => {
    const supabase = createClient()
    const channelName = `gallery-mentions:${viewerId}:${crypto.randomUUID()}`
    const channel = supabase.channel(channelName)

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gallery_comment_mentions",
          filter: `mentioned_user_id=eq.${viewerId}`,
        },
        async (payload) => {
          const commentId = (payload.new as { comment_id?: string }).comment_id
          if (!commentId) return

          const notification = await fetchGalleryMentionNotification(
            supabase,
            commentId,
            viewerId
          )
          if (!notification) return

          setNotifications((current) => {
            if (current.some((item) => item.comment_id === commentId)) {
              return current
            }
            return sortNotifications([notification, ...current])
          })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "gallery_comment_mentions",
          filter: `mentioned_user_id=eq.${viewerId}`,
        },
        (payload) => {
          const row = payload.new as {
            comment_id?: string
            read_at?: string | null
          }
          if (!row.comment_id || !row.read_at) return
          setNotifications((current) =>
            current.filter((item) => item.comment_id !== row.comment_id)
          )
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [viewerId])

  const openMention = (notification: GalleryMentionNotification) => {
    startTransition(async () => {
      const result = await markGalleryMentionsRead([notification.comment_id])
      if (!result.ok) return
      setNotifications((current) =>
        current.filter((item) => item.comment_id !== notification.comment_id)
      )
      router.push(
        buildGalleryPhotoHref({
          photoId: notification.image_id,
          commentId: notification.comment_id,
        })
      )
    })
  }

  const markAllRead = () => {
    if (notifications.length === 0) return
    startTransition(async () => {
      const result = await markGalleryMentionsRead(
        notifications.map((item) => item.comment_id)
      )
      if (!result.ok) return
      setNotifications([])
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(galleryShellIconButtonClass(), "relative")}
          aria-label={
            unreadCount > 0
              ? `${unreadCount} unread mention${unreadCount === 1 ? "" : "s"}`
              : "Mentions"
          }
          disabled={isPending}
        >
          <IconBell className="size-4" aria-hidden />
          {unreadCount > 0 ? (
            <span
              className={cn(
                gallerySans(),
                "absolute -top-0.5 -right-0.5 flex min-w-[1rem] items-center justify-center rounded-full bg-foreground px-1 py-0.5 text-[9px] leading-none font-medium text-background"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(gallerySans(), "w-80 max-w-[calc(100vw-2rem)]")}
      >
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Mentions</span>
          {unreadCount > 0 ? (
            <button
              type="button"
              className="text-[10px] tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
              onClick={markAllRead}
              disabled={isPending}
            >
              Mark all read
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {unreadCount === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            No unread @mentions.
          </div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.comment_id}
              className="flex cursor-pointer flex-col items-start gap-1 py-2"
              onClick={() => openMention(notification)}
              disabled={isPending}
            >
              <span className="text-xs text-foreground">
                <span className="font-medium">{notification.author_name}</span>
                {" mentioned you on "}
                <span className="font-medium">{notification.image_name}</span>
              </span>
              <span className="line-clamp-2 text-[11px] text-muted-foreground">
                {truncateBody(notification.body)}
              </span>
              <span className="text-[10px] text-muted-foreground/80">
                {formatUploadedAt(notification.created_at)}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
