"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  useCreateQuizSet,
  useSaveQuizQuestions,
  type QuizQuestionDraft,
} from "@/hooks/games/use-quiz-sets"

import { QuizSetForm } from "../_components/quiz-set-form"

export default function NewQuizSetPage() {
  const router = useRouter()
  const createQuizSet = useCreateQuizSet()
  const saveQuestions = useSaveQuizQuestions()

  const handleSubmit = async (
    title: string,
    questions: QuizQuestionDraft[]
  ) => {
    const quizSet = await createQuizSet.mutateAsync(title)
    await saveQuestions.mutateAsync({ quizSetId: quizSet.id, questions })
    toast.success("題庫已建立")
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
        <span className="text-sm font-medium">建立新題庫</span>
      </div>

      <h1 className="text-2xl font-bold">建立新題庫</h1>

      <QuizSetForm submitLabel="建立題庫" onSubmit={handleSubmit} />
    </div>
  )
}
