"use client"

import Link from "next/link"
import { useActionState, useEffect, useId } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@workspace/ui/components/alert-dialog"
import { manageApplication } from "../actions"

export function ActionForm({
  children,
  label,
  className = "space-y-4",
  confirmation,
}: {
  children: React.ReactNode
  label: string
  className?: string
  confirmation?: string
}) {
  const formId = useId()
  const [state, action, pending] = useActionState(manageApplication, {})
  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.message) toast.success(state.message)
  }, [state])
  return (
    <form id={formId} action={action} className={className}>
      {children}
      {confirmation ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" disabled={pending}>
              {pending ? "處理中…" : label}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{label}？</AlertDialogTitle>
              <AlertDialogDescription>{confirmation}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction type="submit" form={formId}>
                確認
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button type="submit" disabled={pending}>
          {pending ? "處理中…" : label}
        </Button>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.secret && (
        <div className="space-y-2 rounded-lg border p-4" role="status">
          <p className="text-sm font-medium">Client secret · 只顯示這一次</p>
          <p className="text-sm text-muted-foreground">
            請立即保存至應用程式後端的環境變數。
          </p>
          <code className="block text-sm break-all select-all">
            {state.secret}
          </code>
        </div>
      )}
      {state.id && (
        <Link
          href={`/developers/${state.id}`}
          className="block text-sm underline underline-offset-4"
        >
          管理已建立的應用程式 →
        </Link>
      )}
    </form>
  )
}
