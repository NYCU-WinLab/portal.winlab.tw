"use client"

import Link from "next/link"

import { Skeleton } from "@workspace/ui/components/skeleton"

import { useQuizPlayers } from "@/hooks/games/use-quiz-players"
import {
  useQuizHistory,
  useQuizSessionAnswers,
  useQuizSessionQuestions,
} from "@/hooks/games/use-quiz-history"

import { QuizLeaderboard } from "./quiz-leaderboard"

export function QuizHistoryDetail({ sessionId }: { sessionId: string }) {
  const { data: sessions, isLoading: sessionsLoading } = useQuizHistory()
  const { data: questions, isLoading: questionsLoading } =
    useQuizSessionQuestions(sessionId)
  const { data: answers } = useQuizSessionAnswers(sessionId)
  const { data: players } = useQuizPlayers(sessionId)

  const session = sessions?.find((s) => s.id === sessionId)

  if (sessionsLoading || questionsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          找不到這場紀錄，可能還沒結束或你沒有參加過。
        </p>
        <Link
          href="/games/quiz/history"
          className="text-sm text-primary hover:underline"
        >
          ← 回歷史紀錄
        </Link>
      </div>
    )
  }

  const playerById = new Map((players ?? []).map((p) => [p.id, p]))

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-3">
        <Link
          href="/games/quiz/history"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← 歷史紀錄
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{session.quiz_title}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(session.ended_at ?? session.created_at).toLocaleString(
            "zh-TW"
          )}
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          最終排行榜
        </h2>
        <QuizLeaderboard players={players ?? []} />
      </div>

      <div className="space-y-6">
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          逐題紀錄
        </h2>
        {questions?.map((q) => {
          const questionAnswers = (answers ?? []).filter(
            (a) => a.question_id === q.id
          )
          return (
            <div key={q.id} className="space-y-4 rounded-xl border bg-card p-5">
              <div>
                <span className="text-xs text-muted-foreground">
                  第 {q.position} 題
                </span>
                <h3 className="text-lg font-semibold">{q.question_text}</h3>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {q.choices.map((choice, i) => (
                  <div
                    key={i}
                    className={
                      i === q.correct_index
                        ? "rounded-lg border-2 border-green-500 bg-green-500/10 p-3 text-sm font-medium"
                        : "rounded-lg border p-3 text-sm font-medium opacity-60"
                    }
                  >
                    {choice}
                  </div>
                ))}
              </div>
              {questionAnswers.length > 0 && (
                <div className="space-y-1">
                  {questionAnswers.map((a) => {
                    const player = playerById.get(a.player_id)
                    return (
                      <div
                        key={a.id}
                        className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 rounded-md px-2 py-1.5 text-sm"
                      >
                        <span className="truncate">
                          {player?.nickname ?? "玩家"}
                        </span>
                        <span className="text-muted-foreground">
                          {q.choices[a.choice_index]}
                        </span>
                        <span
                          className={
                            a.is_correct ? "text-green-600" : "text-destructive"
                          }
                        >
                          {a.is_correct ? "✓" : "✗"}
                        </span>
                        <span className="text-right tabular-nums">
                          +{a.points_awarded}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
