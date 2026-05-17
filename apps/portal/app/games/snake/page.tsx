"use client"

import { GamePage } from "../_components/game-page"
import { GameSnake } from "../_components/game-snake"

export default function PageSnake() {
  return (
    <GamePage
      gameType="snake"
      game={(onComplete) => <GameSnake onComplete={onComplete} />}
    />
  )
}
