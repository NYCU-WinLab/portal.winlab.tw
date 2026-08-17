import type { GalleryNotification } from "@/lib/gallery/notifications"

export function truncateNotificationBody(body: string, max = 72): string {
  const trimmed = body.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

export function notificationSummary(notification: GalleryNotification): string {
  const actor = notification.actor_name
  const work = notification.image_name
  if (notification.kind === "mention") {
    return `${actor} mentioned you on ${work}`
  }
  if (notification.kind === "reply") {
    return `${actor} replied to your comment on ${work}`
  }
  if (notification.kind === "comment_like") {
    return `${actor} liked your comment on ${work}`
  }
  return `${actor} reacted to ${work}`
}
