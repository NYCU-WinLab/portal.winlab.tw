"use client"

import { useCallback, useState, type ReactNode } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { useSubmitScore } from "@/hooks/games/use-scores"
import { GAME_META, formatTime } from "@/lib/games/constants"
import type { GameResult, GameType } from "@/lib/games/types"
import { Scoreboard } from "./scoreboard"

interface GamePageProps {
  gameType: GameType
  game: (
    onComplete: (result: GameResult) => void,
    onLevelChange: (level: number | null, displayLabel?: string | null) => void
  ) => ReactNode
}

export function GamePage({ gameType, game }: GamePageProps) {
  const meta = GAME_META[gameType]
  const [level, setLevel] = useState<number | null>(null)
  const [levelLabel, setLevelLabel] = useState<string | null>(null)
  const { mutate: submit } = useSubmitScore(gameType, level)

  const handleComplete = useCallback(
    (result: GameResult) => {
      submit(
        { score: result.score, finishTimeMs: result.finishTimeMs },
        {
          onSuccess: () => {
            toast.success(
              `成績已記錄！${meta.scoreLabel(result.score)} · ${formatTime(result.finishTimeMs)}`
            )
          },
          onError: () => {
            toast.error("成績儲存失敗，請重試")
          },
        }
      )
    },
    [submit, meta]
  )

  const handleLevelChange = useCallback(
    (next: number | null, label?: string | null) => {
      setLevel(next)
      setLevelLabel(label ?? null)
    },
    []
  )

  const scoreboardTitle =
    level === null ? "排行榜" : `排行榜 · ${levelLabel ?? `關卡 ${level}`}`

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-3">
        <Link
          href="/games"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← 遊戲大廳
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">
          {meta.icon} {meta.title}
        </span>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-bold">{meta.title}</h1>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
          {game(handleComplete, handleLevelChange)}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            {scoreboardTitle}
          </h2>
          <Scoreboard gameType={gameType} level={level} />
        </div>
      </div>
    </div>
  )
}
