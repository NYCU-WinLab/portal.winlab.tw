"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Document, Page } from "react-pdf"

import "@/lib/approve/pdf" // side-effect: worker registration

import { Button } from "@workspace/ui/components/button"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

export type PageSize = { width: number; height: number }

export function PdfCanvas({
  fileUrl,
  page,
  onPageChange,
  onPageSize,
  children,
}: {
  fileUrl: string
  page: number
  onPageChange: (next: number) => void
  onPageSize?: (size: PageSize) => void
  children?: (size: PageSize) => ReactNode
}) {
  const [numPages, setNumPages] = useState(0)
  const [size, setSize] = useState<PageSize | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (size) onPageSize?.(size)
  }, [size, onPageSize])

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={pageRef}
        className="relative mx-auto w-fit rounded border bg-background"
      >
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        >
          <Page
            pageNumber={page}
            width={600}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            onLoadSuccess={({ width, height }) => setSize({ width, height })}
          />
        </Document>
        {size && children ? (
          <div className="absolute inset-0 z-10">{children(size)}</div>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-3 text-sm">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <IconChevronLeft className="size-4" />
          上一頁
        </Button>
        <span className="text-muted-foreground tabular-nums">
          {page} / {numPages || "—"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={page >= numPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一頁
          <IconChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
