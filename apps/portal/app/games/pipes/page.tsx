"use client"

import { GamePage } from "../_components/game-page"
import { GamePipes } from "../_components/game-pipes"

export default function PagePipes() {
  return (
    <GamePage
      gameType="pipes"
      game={(onComplete, onLevelChange) => (
        <GamePipes onComplete={onComplete} onLevelChange={onLevelChange} />
      )}
    />
  )
}
