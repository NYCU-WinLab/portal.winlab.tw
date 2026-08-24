"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

import { useAuth } from "@/hooks/use-auth"
import { useQuizSession } from "@/hooks/games/use-quiz-session"
import { useCurrentQuizQuestion } from "@/hooks/games/use-quiz-question"
import { useQuizPlayers } from "@/hooks/games/use-quiz-players"
import { useSubmitQuizAnswer } from "@/hooks/games/use-quiz-answer"
import { useQuizRealtime } from "@/hooks/games/use-quiz-realtime"
import { remainingSeconds } from "@/lib/games/quiz/countdown"

import { QuizLeaderboard } from "./quiz-leaderboard"

const CHOICE_COLORS = [
  "border-red-500/40 hover:bg-red-500/10",
  "border-blue-500/40 hover:bg-blue-500/10",
  "border-amber-500/40 hover:bg-amber-500/10",
  "border-emerald-500/40 hover:bg-emerald-500/10",
  "border-purple-500/40 hover:bg-purple-500/10",
  "border-pink-500/40 hover:bg-pink-500/10",
]

export function QuizPlay({ sessionId }: { sessionId: string }) {
  useQuizRealtime(sessionId)
  const { user } = useAuth()
  const { data: session, isLoading: sessionLoading } = useQuizSession(sessionId)
  const { data: players } = useQuizPlayers(sessionId)
  const { data: question } = useCurrentQuizQuestion(sessionId)
  const submitAnswer = useSubmitQuizAnswer(sessionId)

  // Tracks only "did I submit for this question" -- keyed by questionId
  // instead of reset-on-change in an effect, since an answer from a
  // previous question simply stops matching question.question_id once the
  // host advances. The actual result (right/wrong, points) is never known
  // client-side until reveal: submit_quiz_answer returns nothing, so it
  // comes from question.my_is_correct/my_points_awarded below, which the
  // RPC only fills in once the session reaches 'reveal'.
  const [answeredQuestionId, setAnsweredQuestionId] = useState<string | null>(
    null
  )

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (session?.status !== "question") return
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [session?.status])

  if (sessionLoading || !session) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const handleAnswer = (choiceIndex: number) => {
    if (!question || answeredQuestionId === question.question_id) return
    const questionId = question.question_id
    submitAnswer.mutate(
      { questionId, choiceIndex },
      {
        onSuccess: () => setAnsweredQuestionId(questionId),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const isSubmittingThisQuestion =
    submitAnswer.isPending &&
    submitAnswer.variables?.questionId === question?.question_id
  const hasAnswered =
    (!!question && answeredQuestionId === question.question_id) ||
    isSubmittingThisQuestion
  const lastResult =
    question?.my_is_correct != null
      ? {
          isCorrect: question.my_is_correct,
          points: question.my_points_awarded ?? 0,
        }
      : null

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Link
          href="/games/quiz"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← 即時問答
        </Link>
        <span className="text-xs text-muted-foreground">玩家畫面</span>
      </div>

      {session.status === "lobby" && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="size-3 animate-ping rounded-full bg-primary" />
          <p className="text-lg font-medium">等待主持人開始遊戲…</p>
          <p className="text-sm text-muted-foreground">
            目前 {players?.length ?? 0} 位玩家已加入
          </p>
        </div>
      )}

      {session.status === "question" && question && (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              第 {question.position} / {question.question_count} 題
            </span>
            <span className="font-mono text-lg font-semibold text-foreground">
              {remainingSeconds(
                question.question_started_at,
                question.time_limit_seconds,
                now
              )}
              s
            </span>
          </div>
          <h1 className="text-xl font-bold">{question.question_text}</h1>

          {hasAnswered ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              已送出答案，等待主持人公布結果…
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {question.choices.map((choice, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  disabled={submitAnswer.isPending}
                  className={cn(
                    "rounded-xl border-2 bg-card p-6 text-center text-lg font-semibold transition-colors disabled:opacity-50",
                    CHOICE_COLORS[i % CHOICE_COLORS.length]
                  )}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {session.status === "reveal" && question && (
        <div className="space-y-6">
          <h1 className="text-center text-2xl font-bold">
            {question.question_text}
          </h1>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {question.choices.map((choice, i) => (
              <div
                key={i}
                className={
                  i === question.correct_index
                    ? "rounded-xl border-2 border-green-500 bg-green-500/10 p-4 text-center font-medium"
                    : "rounded-xl border bg-card p-4 text-center font-medium opacity-60"
                }
              >
                {choice}
              </div>
            ))}
          </div>
          {lastResult && (
            <p
              className={cn(
                "text-center text-lg font-semibold",
                lastResult.isCorrect ? "text-green-600" : "text-destructive"
              )}
            >
              {lastResult.isCorrect
                ? `答對了！+${lastResult.points} 分`
                : "答錯了"}
            </p>
          )}
          <QuizLeaderboard players={players ?? []} highlightUserId={user?.id} />
        </div>
      )}

      {session.status === "ended" && (
        <div className="space-y-6">
          <h1 className="text-center text-2xl font-bold">遊戲結束！</h1>
          <QuizLeaderboard players={players ?? []} highlightUserId={user?.id} />
          <div className="flex justify-center">
            <Button asChild>
              <Link href="/games/quiz">返回即時問答</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
