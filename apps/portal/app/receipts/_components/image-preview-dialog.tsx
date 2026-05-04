"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"

import { useReceiptSignedUrl } from "@/hooks/receipts/use-receipts"

export function ImagePreviewDialog({
  path,
  name,
}: {
  path: string
  name: string
}) {
  const { data: url, isLoading } = useReceiptSignedUrl(path)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="size-12 overflow-hidden rounded-md border border-border transition-opacity hover:opacity-80 disabled:cursor-wait"
          disabled={!url}
          aria-label={`預覽 ${name}`}
        >
          {isLoading || !url ? (
            <Skeleton className="size-full" />
          ) : (
            // signed urls are remote; using <img> keeps Next config out of it
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={name}
              className="size-full object-cover"
              loading="lazy"
            />
          )}
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="max-w-3xl border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">{name}</DialogTitle>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={name}
            className="max-h-[85vh] w-full rounded-2xl object-contain"
          />
        ) : (
          <Skeleton className="aspect-square w-full" />
        )}
      </DialogContent>
    </Dialog>
  )
}
