"use client"

import Link from "next/link"

import { useQuizHistory } from "@/hooks/games/use-quiz-history"

export default function QuizHistoryPage() {
  const { data: sessions, isLoading } = useQuizHistory()

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/games/quiz"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← 即時問答
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">歷史紀錄</span>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">歷史紀錄</h1>
        <p className="text-sm text-muted-foreground">
          你主持過或玩過的場次，結束後都會留在這裡。
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : !sessions?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          還沒有結束過的場次。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/games/quiz/history/${session.id}`}
              className="flex flex-col gap-1 rounded-xl border bg-card p-6 transition-all hover:border-foreground/20 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold">{session.quiz_title}</h2>
              <p className="text-xs text-muted-foreground">
                {new Date(
                  session.ended_at ?? session.created_at
                ).toLocaleString("zh-TW")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
