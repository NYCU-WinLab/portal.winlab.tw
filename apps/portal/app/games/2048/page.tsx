"use client"

import { GamePage } from "../_components/game-page"
import { Game2048 } from "../_components/game-2048"

export default function Page2048() {
  return (
    <GamePage
      gameType="2048"
      game={(onComplete) => <Game2048 onComplete={onComplete} />}
    />
  )
}
