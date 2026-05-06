"use client"

import { Plus } from "lucide-react"
import { useMemo, useState } from "react"

import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useReceipts } from "@/hooks/receipts/use-receipts"
import type { Receipt } from "@/lib/receipts/types"

import { ReceiptPreviewDialog } from "./receipt-preview-dialog"
import { ReceiptRowActions } from "./row-actions"
import { ReceiptsSearchBar } from "./search-bar"
import { STATUS_LABELS, StatusSelect } from "./status-select"
import { TagBadge } from "./tag-badge"
import { TagPickerPopover } from "./tag-picker-popover"
import { UploadDialog } from "./upload-dialog"

export function ReceiptsView() {
  const {
    data: receipts,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useReceipts()
  const [search, setSearch] = useState("")

  const filtered = useMemo(
    () => filterReceipts(receipts ?? [], search),
    [receipts, search]
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-medium">收據</h1>
        <UploadDialog />
      </div>

      <ReceiptsSearchBar value={search} onChange={setSearch} />

      <div className="rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名稱</TableHead>
              <TableHead className="w-20">檔案</TableHead>
              <TableHead className="min-w-48">標籤</TableHead>
              <TableHead className="w-40">狀態</TableHead>
              <TableHead className="w-12 text-right">動作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows />
            ) : !receipts || receipts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {error ? (
                    <button
                      type="button"
                      onClick={() => refetch()}
                      disabled={isRefetching}
                      className="underline-offset-2 hover:underline"
                    >
                      讀取失敗（{error.message}）— 點此重試
                    </button>
                  ) : (
                    "還沒有收據，按右上角上傳一張。"
                  )}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  找不到符合「{search}」的收據。
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <ReceiptPreviewDialog path={r.imagePath} name={r.name} />
                  </TableCell>
                  <TableCell>
                    <TagPickerPopover
                      receiptId={r.id}
                      attachedTagIds={r.tags.map((t) => t.id)}
                      trigger={
                        <button
                          type="button"
                          className="-mx-1 flex flex-wrap items-center gap-1.5 rounded-md px-1 py-1 hover:bg-muted/60"
                          aria-label={`管理 ${r.name} 的標籤`}
                        >
                          {r.tags.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Plus className="size-3" />
                              加標籤
                            </span>
                          ) : (
                            r.tags.map((tag) => (
                              <TagBadge key={tag.id} tag={tag} />
                            ))
                          )}
                        </button>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <StatusSelect id={r.id} value={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ReceiptRowActions
                      id={r.id}
                      name={r.name}
                      path={r.imagePath}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function filterReceipts(receipts: Receipt[], search: string): Receipt[] {
  const q = search.trim().toLowerCase()
  if (!q) return receipts
  return receipts.filter((r) => {
    const haystack = [
      r.name,
      STATUS_LABELS[r.status],
      r.status,
      ...r.tags.map((t) => t.name),
    ]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  })
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="size-9 rounded-md" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-9 w-32" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto size-9 rounded-md" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
