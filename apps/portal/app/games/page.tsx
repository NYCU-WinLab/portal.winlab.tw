"use client"

import Link from "next/link"

import { GameCard } from "./_components/game-card"
import { GAME_META, GAME_ORDER } from "@/lib/games/constants"

export default function GamesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Games</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          選擇一款遊戲，挑戰全員排行榜！
        </p>
      </div>

      <Link
        href="/games/quiz"
        className="group flex flex-col gap-3 rounded-xl border bg-card p-6 transition-all hover:border-foreground/20 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <span className="text-4xl">🧠</span>
          <div>
            <h2 className="text-lg font-semibold group-hover:text-foreground">
              即時問答
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              自建版 Kahoot — 主持人開房間出題，大家用自己的裝置搶答
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground transition-colors group-hover:text-foreground">
          進入 →
        </span>
      </Link>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GAME_ORDER.map((slug) => (
          <GameCard key={slug} meta={GAME_META[slug]} />
        ))}
      </div>
    </div>
  )
}
