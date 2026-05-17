"use client"

import { GamePage } from "../_components/game-page"
import { GameTyping } from "../_components/game-typing"

export default function PageTyping() {
  return (
    <GamePage
      gameType="typing"
      game={(onComplete) => <GameTyping onComplete={onComplete} />}
    />
  )
}
