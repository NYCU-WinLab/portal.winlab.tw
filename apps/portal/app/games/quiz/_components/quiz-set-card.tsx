"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
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

import { useDeleteQuizSet } from "@/hooks/games/use-quiz-sets"
import type { QuizSet } from "@/lib/games/quiz/types"

interface QuizSetCardProps {
  quizSet: QuizSet
  isOwner: boolean
  hosting: boolean
  onHost: () => void
}

export function QuizSetCard({
  quizSet,
  isOwner,
  hosting,
  onHost,
}: QuizSetCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteQuizSet = useDeleteQuizSet()

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-6">
      <div>
        <h3 className="text-lg font-semibold">{quizSet.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          建立於 {new Date(quizSet.created_at).toLocaleDateString("zh-TW")}
        </p>
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Button onClick={onHost} disabled={hosting} size="sm">
          {hosting ? "開房間中…" : "主持"}
        </Button>
        {isOwner && (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/games/quiz/${quizSet.id}/edit`}>編輯</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              刪除
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除「{quizSet.title}」？</AlertDialogTitle>
            <AlertDialogDescription>
              題庫跟裡面所有題目都會一起刪掉，沒辦法救回。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteQuizSet.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteQuizSet.isPending}
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              onClick={() =>
                deleteQuizSet.mutate(quizSet.id, {
                  onSuccess: () => {
                    toast.success(`已刪除「${quizSet.title}」`)
                    setConfirmDelete(false)
                  },
                  onError: (err) => toast.error(err.message),
                })
              }
            >
              {deleteQuizSet.isPending ? "刪除中…" : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
