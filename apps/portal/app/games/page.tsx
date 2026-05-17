"use client"

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GAME_ORDER.map((slug) => (
          <GameCard key={slug} meta={GAME_META[slug]} />
        ))}
      </div>
    </div>
  )
}
