"use client"

import { useLeaderboard } from "@/hooks/games/use-scores"
import { GAME_META, formatTime } from "@/lib/games/constants"
import type { GameType } from "@/lib/games/types"

interface ScoreboardProps {
  gameType: GameType
}

export function Scoreboard({ gameType }: ScoreboardProps) {
  const { data: scores, isLoading } = useLeaderboard(gameType)
  const meta = GAME_META[gameType]

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted" />
        ))}
      </div>
    )
  }

  if (!scores?.length) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        還沒有成績，快來成為第一名！
      </p>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-2 grid grid-cols-[2rem_1fr_auto_auto] gap-x-3 px-2 text-xs text-muted-foreground">
        <span>#</span>
        <span>玩家</span>
        <span className="text-right">成績</span>
        <span className="text-right">時間</span>
      </div>
      <div className="space-y-1">
        {scores.map((entry, i) => (
          <div
            key={entry.user_id}
            className="grid grid-cols-[2rem_1fr_auto_auto] items-center gap-x-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
          >
            <span
              className={
                i === 0
                  ? "font-bold text-yellow-500"
                  : i === 1
                    ? "font-semibold text-zinc-400"
                    : i === 2
                      ? "font-semibold text-amber-600"
                      : "text-muted-foreground"
              }
            >
              {i + 1}
            </span>
            <span className="truncate font-medium">{entry.user_name}</span>
            <span className="text-right tabular-nums">
              {meta.scoreLabel(entry.score)}
            </span>
            <span className="text-right text-muted-foreground tabular-nums">
              {formatTime(entry.finish_time_ms)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
