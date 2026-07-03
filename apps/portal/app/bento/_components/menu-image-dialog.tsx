"use client"

import { Image as ImageIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

// A "查看菜單圖" trigger that opens the shop's uploaded menu image in a large,
// scrollable lightbox. Menu photos are wide/high-res, so the dialog goes near
// full-width and links to the original for reading fine print.
export function MenuImageButton({
  imageUrl,
  shopName,
  className,
}: {
  imageUrl: string
  shopName: string
  className?: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 text-foreground transition-colors hover:text-muted-foreground",
            className
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          查看菜單圖
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] gap-3 sm:max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>{shopName} 菜單</DialogTitle>
        </DialogHeader>
        <div className="max-h-[80vh] overflow-auto rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`${shopName} 菜單圖片`}
            className="mx-auto h-auto w-full"
          />
        </div>
        <a
          href={imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          在新分頁開啟原圖（看更清楚）
        </a>
      </DialogContent>
    </Dialog>
  )
}
