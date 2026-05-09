"use client"

import { Bell, BellOff, Pencil, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"
import { type Announcement } from "@/lib/bulletin/types"
import { AnnouncementDialog } from "@/app/_components/announcement-dialog"
import { ConfirmDialog } from "@/app/bento/_components/confirm-dialog"

export function AnnouncementActions({
  announcement,
}: {
  announcement: Announcement
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notified, setNotified] = useState<string | null>(
    announcement.notifiedAt
  )
  const [toggling, setToggling] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", announcement.id)
      if (error) throw error
      toast.success("公告已刪除")
      router.push("/")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "刪除失敗")
      setDeleting(false)
    }
  }

  const handleToggleNotified = async () => {
    setToggling(true)
    const newValue = notified ? null : new Date().toISOString()
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("announcements")
        .update({ notified_at: newValue })
        .eq("id", announcement.id)
      if (error) throw error
      setNotified(newValue)
      toast.success(newValue ? "已標記為已發信" : "已取消發信標記")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失敗")
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={toggling}
        onClick={handleToggleNotified}
        className="h-7 gap-1 px-2 text-xs"
        title={
          notified
            ? `已於 ${new Date(notified).toLocaleString("zh-TW")} 發信`
            : "尚未發信通知"
        }
      >
        {notified ? (
          <Bell className="size-3 text-green-600" />
        ) : (
          <BellOff className="size-3 text-muted-foreground" />
        )}
        {notified ? "已通知" : "未通知"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditOpen(true)}
        className="h-7 gap-1 px-2 text-xs"
      >
        <Pencil className="size-3" />
        編輯
      </Button>
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="sm"
            disabled={deleting}
            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3" />
            {deleting ? "刪除中…" : "刪除"}
          </Button>
        }
        title="刪除公告？"
        description="此操作無法復原。"
        confirmText="刪除"
        variant="destructive"
        onConfirm={handleDelete}
      />
      <AnnouncementDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={announcement}
      />
    </div>
  )
}
