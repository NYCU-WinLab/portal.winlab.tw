"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { useQuizSession } from "@/hooks/games/use-quiz-session"
import { useCurrentQuizQuestion } from "@/hooks/games/use-quiz-question"
import { useQuizPlayers } from "@/hooks/games/use-quiz-players"
import {
  useAdvanceQuizSession,
  useRevealQuizAnswer,
} from "@/hooks/games/use-quiz-session"
import { useQuizRealtime } from "@/hooks/games/use-quiz-realtime"
import { remainingSeconds } from "@/lib/games/quiz/countdown"

import { QuizLeaderboard } from "./quiz-leaderboard"

export function QuizHost({ sessionId }: { sessionId: string }) {
  useQuizRealtime(sessionId)
  const { data: session, isLoading: sessionLoading } = useQuizSession(sessionId)
  const { data: players } = useQuizPlayers(sessionId)
  const { data: question } = useCurrentQuizQuestion(sessionId)
  const advance = useAdvanceQuizSession(sessionId)
  const reveal = useRevealQuizAnswer(sessionId)

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (session?.status !== "question") return
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [session?.status])

  // Reveal automatically once the clock runs out, instead of leaving the
  // host to notice and click it manually. Guarded by question_id so the
  // once-a-second tick above doesn't fire this more than once per question.
  const autoRevealedQuestionId = useRef<string | null>(null)
  useEffect(() => {
    if (session?.status !== "question" || !question) return
    if (autoRevealedQuestionId.current === question.question_id) return
    const remaining = remainingSeconds(
      question.question_started_at,
      question.time_limit_seconds,
      now
    )
    if (remaining > 0) return
    autoRevealedQuestionId.current = question.question_id
    reveal.mutate(undefined, { onError: (err) => toast.error(err.message) })
  }, [now, session?.status, question, reveal])

  if (sessionLoading || !session) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const handleAdvance = () => {
    advance.mutate(undefined, { onError: (err) => toast.error(err.message) })
  }
  const handleReveal = () => {
    reveal.mutate(undefined, { onError: (err) => toast.error(err.message) })
  }

  const isLastQuestion =
    !!question && question.position >= question.question_count

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Link
          href="/games/quiz"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← 即時問答
        </Link>
        <span className="text-xs text-muted-foreground">主持人畫面</span>
      </div>

      {session.status === "lobby" && (
        <div className="flex flex-col items-center gap-8 py-10">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">房間碼</p>
            <p className="font-mono text-6xl font-bold tracking-widest">
              {session.room_code}
            </p>
          </div>
          <div className="w-full max-w-sm space-y-2">
            <p className="text-center text-sm text-muted-foreground">
              已加入 {players?.length ?? 0} 位玩家
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {players?.map((p) => (
                <span
                  key={p.id}
                  className="rounded-full border bg-card px-3 py-1 text-sm"
                >
                  {p.nickname}
                </span>
              ))}
            </div>
          </div>
          <Button
            size="lg"
            onClick={handleAdvance}
            disabled={advance.isPending}
          >
            {advance.isPending ? "開始中…" : "開始遊戲"}
          </Button>
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
          <h1 className="text-2xl font-bold">{question.question_text}</h1>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {question.choices.map((choice, i) => (
              <div
                key={i}
                className="rounded-xl border bg-card p-4 text-center font-medium"
              >
                {choice}
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <Button onClick={handleReveal} disabled={reveal.isPending}>
              {reveal.isPending ? "公布中…" : "公布答案"}
            </Button>
          </div>
        </div>
      )}

      {session.status === "reveal" && question && (
        <div className="space-y-6">
          <p className="text-center text-sm text-muted-foreground">
            第 {question.position} / {question.question_count} 題
          </p>
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
          <QuizLeaderboard players={players ?? []} />
          <div className="flex justify-center">
            <Button onClick={handleAdvance} disabled={advance.isPending}>
              {advance.isPending
                ? "處理中…"
                : isLastQuestion
                  ? "結束遊戲"
                  : "下一題"}
            </Button>
          </div>
        </div>
      )}

      {session.status === "ended" && (
        <div className="space-y-6">
          <h1 className="text-center text-2xl font-bold">遊戲結束！</h1>
          <QuizLeaderboard players={players ?? []} />
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
