"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  useQuizQuestions,
  useQuizSet,
  useSaveQuizQuestions,
  useUpdateQuizSet,
  type QuizQuestionDraft,
} from "@/hooks/games/use-quiz-sets"

import { QuizSetForm } from "../../../_components/quiz-set-form"

export function EditQuizSet({ quizSetId }: { quizSetId: string }) {
  const router = useRouter()
  const { data: quizSet, isLoading: quizSetLoading } = useQuizSet(quizSetId)
  const { data: questions, isLoading: questionsLoading } =
    useQuizQuestions(quizSetId)
  const updateQuizSet = useUpdateQuizSet()
  const saveQuestions = useSaveQuizQuestions()

  if (quizSetLoading || questionsLoading || !quizSet) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const handleSubmit = async (
    title: string,
    nextQuestions: QuizQuestionDraft[]
  ) => {
    await updateQuizSet.mutateAsync({ quizSetId, title })
    await saveQuestions.mutateAsync({ quizSetId, questions: nextQuestions })
    toast.success("題庫已更新")
    router.push("/games/quiz")
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-3">
        <Link
          href="/games/quiz"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← 即時問答
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">編輯題庫</span>
      </div>

      <h1 className="text-2xl font-bold">編輯「{quizSet.title}」</h1>

      <QuizSetForm
        initialTitle={quizSet.title}
        initialQuestions={questions}
        submitLabel="儲存變更"
        onSubmit={handleSubmit}
      />
    </div>
  )
}
