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
  onLoadError,
  children,
}: {
  fileUrl: string
  page: number
  onPageChange: (next: number) => void
  onPageSize?: (size: PageSize) => void
  onLoadError?: (err: Error) => void
  children?: (size: PageSize) => ReactNode
}) {
  const [numPages, setNumPages] = useState(0)
  const [size, setSize] = useState<PageSize | null>(null)
  const [pageWidth, setPageWidth] = useState(600)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (size) onPageSize?.(size)
  }, [size, onPageSize])

  // Responsive width: track the outer container, cap at 900 for huge screens.
  // Subtract 2 for the container's 1px border on each side so the PDF never
  // paints over the right border.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setPageWidth(Math.max(100, Math.min(Math.floor(w) - 2, 900)))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      <div
        className="relative mx-auto overflow-hidden rounded border bg-background"
        style={{ width: pageWidth + 2, maxWidth: "100%" }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={onLoadError}
        >
          <Page
            pageNumber={page}
            width={pageWidth}
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
