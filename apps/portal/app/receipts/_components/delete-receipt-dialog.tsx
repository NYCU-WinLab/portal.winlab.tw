"use client"

import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"

import { useDeleteReceipt } from "@/hooks/receipts/use-receipts"

export function DeleteReceiptDialog({
  id,
  name,
  path,
  open,
  onOpenChange,
}: {
  id: string
  name: string
  path: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const del = useDeleteReceipt()

  const handleConfirm = () => {
    del.mutate(
      { id, path },
      {
        onSuccess: () => {
          toast.success(`已刪除「${name}」`)
          onOpenChange(false)
        },
        onError: (err) => toast.error(`刪除失敗：${err.message}`),
      }
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>刪除「{name}」？</AlertDialogTitle>
          <AlertDialogDescription>
            這會把資料列跟原始檔案一起刪掉，沒辦法救回。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={del.isPending}
            className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
          >
            {del.isPending ? "刪除中…" : "確認刪除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
