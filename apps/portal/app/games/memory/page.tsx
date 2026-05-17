"use client"

import { GamePage } from "../_components/game-page"
import { GameMemory } from "../_components/game-memory"

export default function PageMemory() {
  return (
    <GamePage
      gameType="memory"
      game={(onComplete) => <GameMemory onComplete={onComplete} />}
    />
  )
}
