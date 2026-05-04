"use client"

import { Download } from "lucide-react"
import { toast } from "sonner"

import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useDownloadReceipt, useReceipts } from "@/hooks/receipts/use-receipts"

import { ReceiptPreviewDialog } from "./receipt-preview-dialog"
import { StatusSelect } from "./status-select"
import { UploadDialog } from "./upload-dialog"

export function ReceiptsView() {
  const {
    data: receipts,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useReceipts()
  const download = useDownloadReceipt()

  const handleDownload = (id: string, name: string, path: string) => {
    download.mutate(
      { name, path },
      {
        onError: (err) => toast.error(`下載失敗：${err.message}`),
      }
    )
  }

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
              <TableHead className="w-20">檔案</TableHead>
              <TableHead className="w-40">狀態</TableHead>
              <TableHead className="w-16 text-right">下載</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows />
            ) : !receipts || receipts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
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
            ) : (
              receipts.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <ReceiptPreviewDialog path={r.imagePath} name={r.name} />
                  </TableCell>
                  <TableCell>
                    <StatusSelect id={r.id} value={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => handleDownload(r.id, r.name, r.imagePath)}
                      disabled={download.isPending}
                      className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      aria-label={`下載 ${r.name}`}
                      title={`下載 ${r.name}.pdf`}
                    >
                      <Download className="size-4" />
                    </button>
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
            <Skeleton className="size-9 rounded-md" />
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
