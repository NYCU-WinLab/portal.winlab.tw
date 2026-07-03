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

import {
  markGalleryActivityNotificationsRead,
  markGalleryMentionsRead,
} from "@/app/actions"
import { ReactionGlyph } from "@/app/_components/reaction-glyph"
import {
  gallerySans,
  galleryShellIconButtonClass,
} from "@/components/gallery-chrome"
import { formatUploadedAt } from "@/lib/gallery/format-uploaded-at"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
import {
  fetchGalleryActivityNotification,
  fetchGalleryMentionNotification,
  isActivityNotificationsUnavailable,
  sortGalleryNotifications,
  type GalleryNotification,
} from "@/lib/gallery/notifications"
import { createClient } from "@/lib/supabase/client"

function truncateBody(body: string, max = 72): string {
  const trimmed = body.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function notificationSummary(notification: GalleryNotification): string {
  const actor = notification.actor_name
  const work = notification.image_name
  if (notification.kind === "mention") {
    return `${actor} mentioned you on ${work}`
  }
  if (notification.kind === "reply") {
    return `${actor} replied to your comment on ${work}`
  }
  return `${actor} reacted to ${work}`
}

export function GalleryMentionBell({
  viewerId,
  initialNotifications,
}: {
  viewerId: string
  initialNotifications: GalleryNotification[]
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
    const channelName = `gallery-notifications:${viewerId}:${crypto.randomUUID()}`
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
            const mapped: GalleryNotification = {
              key: `mention:${notification.comment_id}`,
              kind: "mention",
              image_id: notification.image_id,
              image_name: notification.image_name,
              comment_id: notification.comment_id,
              actor_name: notification.author_name,
              body: notification.body,
              reaction: null,
              created_at: notification.created_at,
              mention_comment_id: notification.comment_id,
              activity_id: null,
            }
            if (current.some((item) => item.key === mapped.key)) return current
            return sortGalleryNotifications([mapped, ...current])
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
            current.filter((item) => item.mention_comment_id !== row.comment_id)
          )
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gallery_activity_notifications",
          filter: `recipient_user_id=eq.${viewerId}`,
        },
        async (payload) => {
          const activityId = (payload.new as { id?: string }).id
          if (!activityId) return

          const notification = await fetchGalleryActivityNotification(
            supabase,
            activityId,
            viewerId
          )
          if (!notification) return

          setNotifications((current) => {
            if (current.some((item) => item.key === notification.key)) {
              return current
            }
            return sortGalleryNotifications([notification, ...current])
          })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "gallery_activity_notifications",
          filter: `recipient_user_id=eq.${viewerId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; read_at?: string | null }
          if (!row.id || !row.read_at) return
          setNotifications((current) =>
            current.filter((item) => item.activity_id !== row.id)
          )
        }
      )
      .subscribe((status, err) => {
        if (
          err &&
          isActivityNotificationsUnavailable({
            message: err.message,
          })
        ) {
          return
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [viewerId])

  const markRead = async (items: GalleryNotification[]) => {
    const mentionIds = items
      .map((item) => item.mention_comment_id)
      .filter((id): id is string => Boolean(id))
    const activityIds = items
      .map((item) => item.activity_id)
      .filter((id): id is string => Boolean(id))

    const [mentionResult, activityResult] = await Promise.all([
      mentionIds.length > 0
        ? markGalleryMentionsRead(mentionIds)
        : Promise.resolve({ ok: true as const }),
      activityIds.length > 0
        ? markGalleryActivityNotificationsRead(activityIds)
        : Promise.resolve({ ok: true as const }),
    ])

    return mentionResult.ok && activityResult.ok
  }

  const openNotification = (notification: GalleryNotification) => {
    startTransition(async () => {
      const ok = await markRead([notification])
      if (!ok) return
      setNotifications((current) =>
        current.filter((item) => item.key !== notification.key)
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
      const ok = await markRead(notifications)
      if (!ok) return
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
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "Notifications"
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
          <span>Notifications</span>
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
            You&apos;re all caught up.
          </div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.key}
              className="flex cursor-pointer flex-col items-start gap-1 py-2"
              onClick={() => openNotification(notification)}
              disabled={isPending}
            >
              <span className="flex items-center gap-1.5 text-xs text-foreground">
                {notification.kind === "reaction" && notification.reaction ? (
                  <ReactionGlyph
                    reaction={notification.reaction}
                    className="shrink-0 text-sm"
                  />
                ) : null}
                <span>{notificationSummary(notification)}</span>
              </span>
              {notification.body ? (
                <span className="line-clamp-2 text-[11px] text-muted-foreground">
                  {truncateBody(notification.body)}
                </span>
              ) : null}
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
