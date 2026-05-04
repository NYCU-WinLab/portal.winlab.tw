"use client"

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

import { ImagePreviewDialog } from "./image-preview-dialog"
import { StatusSelect } from "./status-select"
import { UploadDialog } from "./upload-dialog"

export function ReceiptsView() {
  const { data: receipts, isLoading, error } = useReceipts()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-medium">收據</h1>
        <UploadDialog />
      </div>

      <div className="rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名稱</TableHead>
              <TableHead className="w-20">圖片</TableHead>
              <TableHead className="w-40">狀態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows />
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-10 text-center text-sm text-destructive"
                >
                  讀取失敗：{error.message}
                </TableCell>
              </TableRow>
            ) : !receipts || receipts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  還沒有收據，按右上角上傳一張。
                </TableCell>
              </TableRow>
            ) : (
              receipts.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <ImagePreviewDialog path={r.imagePath} name={r.name} />
                  </TableCell>
                  <TableCell>
                    <StatusSelect id={r.id} value={r.status} />
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

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="size-12 rounded-md" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-9 w-32" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
