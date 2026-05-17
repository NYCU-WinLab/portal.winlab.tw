"use client"

import { GamePage } from "../_components/game-page"
import { GameKings } from "../_components/game-kings"

export default function PageKings() {
  return (
    <GamePage
      gameType="kings"
      game={(onComplete) => <GameKings onComplete={onComplete} />}
    />
  )
}
