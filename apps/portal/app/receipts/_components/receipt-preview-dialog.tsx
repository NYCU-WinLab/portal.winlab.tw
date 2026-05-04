"use client"

import { FileText } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { useReceiptSignedUrl } from "@/hooks/receipts/use-receipts"

export function ReceiptPreviewDialog({
  path,
  name,
}: {
  path: string
  name: string
}) {
  const { data: url, isLoading } = useReceiptSignedUrl(path)

  // #view=FitH tells the browser PDF viewer to fit the page width — without
  // it landscape pages float at the bottom of the iframe with a tall black bar
  // above them.
  const iframeSrc = url ? `${url}#view=FitH` : null

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-50"
          disabled={!iframeSrc}
          aria-label={`預覽 ${name}`}
          title={`預覽 ${name}`}
        >
          {isLoading || !iframeSrc ? (
            <Skeleton className="size-4" />
          ) : (
            <FileText className="size-4" />
          )}
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="grid h-[85vh] max-w-4xl grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogTitle className="border-b border-border px-6 py-3 text-sm font-medium">
          {name}
        </DialogTitle>
        {iframeSrc ? (
          <iframe
            src={iframeSrc}
            title={name}
            className="size-full min-h-0 border-0"
          />
        ) : (
          <Skeleton className="size-full" />
        )}
      </DialogContent>
    </Dialog>
  )
}
