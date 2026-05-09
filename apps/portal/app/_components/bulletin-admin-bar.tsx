"use client"

import { Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { AnnouncementDialog } from "./announcement-dialog"

export function BulletinAdminBar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3" />
        新增公告
      </Button>
      <AnnouncementDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
