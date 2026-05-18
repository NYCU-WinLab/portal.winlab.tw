"use client"

import { GamePage } from "../_components/game-page"
import { GameQueens } from "../_components/game-queens"

export default function PageQueens() {
  return (
    <GamePage
      gameType="queens"
      game={(onComplete, onLevelChange) => (
        <GameQueens onComplete={onComplete} onLevelChange={onLevelChange} />
      )}
    />
  )
}
