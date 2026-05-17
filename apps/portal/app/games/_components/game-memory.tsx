"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import type { GameResult } from "@/lib/games/types"

const EMOJIS = ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼"]

interface Card {
  id: number
  emoji: string
  flipped: boolean
  matched: boolean
}

function buildDeck(): Card[] {
  const cards = [...EMOJIS, ...EMOJIS]
    .map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }))
    .sort(() => Math.random() - 0.5)
    .map((card, i) => ({ ...card, id: i }))
  return cards
}

interface GameMemoryProps {
  onComplete: (result: GameResult) => void
}

export function GameMemory({ onComplete }: GameMemoryProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [flippedIds, setFlippedIds] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [started, setStarted] = useState(false)
  const [completed, setCompleted] = useState(false)
  const startRef = useRef<number | null>(null)
  const lockRef = useRef(false)
  const completedRef = useRef(false)

  const start = useCallback(() => {
    completedRef.current = false
    setCards(buildDeck())
    setFlippedIds([])
    setMoves(0)
    setStarted(true)
    setCompleted(false)
    startRef.current = Date.now()
    lockRef.current = false
  }, [])

  const handleFlip = useCallback(
    (id: number) => {
      if (lockRef.current || !started) return
      setCards((prev) => {
        const card = prev[id]
        if (!card || card.matched || card.flipped) return prev
        return prev.map((c) => (c.id === id ? { ...c, flipped: true } : c))
      })
      setFlippedIds((prev) => {
        if (prev.length === 1 && prev[0] !== id) return [...prev, id]
        if (prev.length === 0) return [id]
        return prev
      })
      setMoves((m) => m + 1)
    },
    [started]
  )

  useEffect(() => {
    if (flippedIds.length !== 2) return
    lockRef.current = true
    const a = flippedIds[0]!
    const b = flippedIds[1]!
    setCards((prev) => {
      const ca = prev[a]
      const cb = prev[b]
      if (ca?.emoji === cb?.emoji) {
        const next = prev.map((c) =>
          c.id === a || c.id === b ? { ...c, matched: true } : c
        )
        const allMatched = next.every((c) => c.matched)
        if (allMatched && !completedRef.current) {
          completedRef.current = true
          const ms = Date.now() - (startRef.current ?? Date.now())
          setCompleted(true)
          setTimeout(
            () => onComplete({ score: EMOJIS.length, finishTimeMs: ms }),
            200
          )
        }
        lockRef.current = false
        return next
      }
      return prev
    })
    if (cards[a]?.emoji !== cards[b]?.emoji) {
      const timer = setTimeout(() => {
        setCards((prev) =>
          prev.map((c) =>
            c.id === a || c.id === b ? { ...c, flipped: false } : c
          )
        )
        setFlippedIds([])
        lockRef.current = false
      }, 900)
      return () => clearTimeout(timer)
    }
    setFlippedIds([])
  }, [flippedIds, cards, onComplete])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-xs items-center justify-between">
        <div className="text-sm text-muted-foreground">
          翻牌 <span className="font-bold text-foreground">{moves}</span> 次
        </div>
        <Button size="sm" variant="outline" onClick={start}>
          {!started ? "開始遊戲" : "重新開始"}
        </Button>
      </div>

      {!started ? (
        <p className="py-8 text-sm text-muted-foreground">點擊「開始遊戲」</p>
      ) : (
        <div className="grid w-full max-w-xs grid-cols-4 gap-2">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => handleFlip(card.id)}
              className={`flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 text-2xl transition-all duration-200 select-none ${
                card.matched
                  ? "border-green-400 bg-green-50 opacity-60 dark:bg-green-950"
                  : card.flipped
                    ? "border-foreground/20 bg-card"
                    : "border-muted bg-muted hover:bg-muted/70"
              }`}
            >
              {card.flipped || card.matched ? card.emoji : "?"}
            </button>
          ))}
        </div>
      )}

      {completed && (
        <p className="font-semibold text-green-600">🎉 完成！翻了 {moves} 次</p>
      )}
    </div>
  )
}
