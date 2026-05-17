"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import type { GameResult } from "@/lib/games/types"

// --- Puzzle definitions ---
// regions[r][c] = region id; solution[r][c] = true if king placed here
// All puzzles verified: 1 king/row, 1/col, 1/region, no adjacency

const PUZZLES = [
  {
    size: 5,
    label: "5×5 入門",
    regions: [
      [0, 0, 0, 1, 1],
      [2, 2, 0, 1, 1],
      [4, 2, 2, 3, 3],
      [4, 4, 3, 3, 3],
      [4, 4, 4, 3, 3],
    ],
    // Kings at: (0,2) R0  (1,4) R1  (2,1) R2  (3,3) R3  (4,0) R4
    solution: [
      [false, false, true, false, false],
      [false, false, false, false, true],
      [false, true, false, false, false],
      [false, false, false, true, false],
      [true, false, false, false, false],
    ],
  },
  {
    size: 5,
    label: "5×5 進階",
    regions: [
      [1, 1, 0, 0, 0],
      [1, 1, 1, 0, 0],
      [3, 3, 4, 2, 2],
      [3, 4, 4, 2, 2],
      [3, 3, 4, 4, 2],
    ],
    // Kings at: (0,4) R0  (1,1) R1  (2,3) R2  (3,0) R3  (4,2) R4
    solution: [
      [false, false, false, false, true],
      [false, true, false, false, false],
      [false, false, false, true, false],
      [true, false, false, false, false],
      [false, false, true, false, false],
    ],
  },
  {
    size: 6,
    label: "6×6 挑戰",
    regions: [
      [0, 0, 1, 1, 1, 4],
      [0, 2, 2, 2, 1, 4],
      [2, 2, 5, 3, 4, 4],
      [5, 5, 5, 3, 3, 4],
      [5, 5, 5, 3, 3, 4],
      [5, 5, 5, 3, 4, 4],
    ],
    // Kings at: (0,1) R0  (1,4) R1  (2,0) R2  (3,3) R3  (4,5) R4  (5,2) R5
    solution: [
      [false, true, false, false, false, false],
      [false, false, false, false, true, false],
      [true, false, false, false, false, false],
      [false, false, false, true, false, false],
      [false, false, false, false, false, true],
      [false, false, true, false, false, false],
    ],
  },
]

const REGION_COLORS = [
  "bg-blue-200 dark:bg-blue-900/60",
  "bg-orange-200 dark:bg-orange-900/60",
  "bg-purple-200 dark:bg-purple-900/60",
  "bg-emerald-200 dark:bg-emerald-900/60",
  "bg-rose-200 dark:bg-rose-900/60",
  "bg-yellow-200 dark:bg-yellow-900/60",
]

function checkViolation(
  placement: boolean[][],
  r: number,
  c: number,
  size: number
): boolean {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const nr = r + dr,
        nc = c + dc
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && placement[nr]?.[nc])
        return true
    }
  }
  return false
}

function isComplete(
  placement: boolean[][],
  regions: number[][],
  size: number
): boolean {
  let total = 0
  const regionSet = new Set<number>()
  const rows = new Set<number>()
  const cols = new Set<number>()

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!placement[r]?.[c]) continue
      total++
      if (checkViolation(placement, r, c, size)) return false
      if (regionSet.has(regions[r]![c]!)) return false
      regionSet.add(regions[r]![c]!)
      if (rows.has(r) || cols.has(c)) return false
      rows.add(r)
      cols.add(c)
    }
  }

  const numRegions = new Set(regions.flat()).size
  return total === numRegions && regionSet.size === numRegions
}

interface GameKingsProps {
  onComplete: (result: GameResult) => void
}

export function GameKings({ onComplete }: GameKingsProps) {
  const [puzzleIdx, setPuzzleIdx] = useState(0)
  const [placement, setPlacement] = useState<boolean[][]>([])
  const [gameState, setGameState] = useState<"idle" | "playing" | "won">("idle")
  const startRef = useRef<number | null>(null)
  const completedRef = useRef(false)

  const puzzle = PUZZLES[puzzleIdx]!

  const start = useCallback((idx: number) => {
    const p = PUZZLES[idx]!
    completedRef.current = false
    setPlacement(
      Array.from({ length: p.size }, () => Array(p.size).fill(false))
    )
    setGameState("playing")
    startRef.current = Date.now()
  }, [])

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (gameState !== "playing") return
      setPlacement((prev) => {
        const next = prev.map((row) => [...row])
        next[r]![c] = !next[r]![c]
        return next
      })
    },
    [gameState]
  )

  const violations = useMemo(() => {
    const set = new Set<string>()
    if (!placement.length) return set
    for (let r = 0; r < puzzle.size; r++) {
      for (let c = 0; c < puzzle.size; c++) {
        if (placement[r]?.[c] && checkViolation(placement, r, c, puzzle.size)) {
          set.add(`${r},${c}`)
        }
      }
    }
    return set
  }, [placement, puzzle.size])

  const won = useMemo(
    () =>
      gameState === "playing" &&
      placement.length > 0 &&
      isComplete(placement, puzzle.regions, puzzle.size),
    [placement, puzzle, gameState]
  )

  useEffect(() => {
    if (won && !completedRef.current) {
      completedRef.current = true
      const ms = Date.now() - (startRef.current ?? Date.now())
      setGameState("won")
      setTimeout(
        () => onComplete({ score: puzzle.size, finishTimeMs: ms }),
        300
      )
    }
  }, [won, puzzle.size, onComplete])

  const kingCount = placement.flat().filter(Boolean).length
  const numRegions = new Set(puzzle.regions.flat()).size

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Puzzle selector */}
      <div className="flex flex-wrap justify-center gap-2">
        {PUZZLES.map((p, i) => (
          <button
            key={i}
            onClick={() => {
              setPuzzleIdx(i)
              start(i)
            }}
            className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
              puzzleIdx === i && gameState !== "idle"
                ? "border-foreground bg-foreground text-background"
                : "border-muted hover:border-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex w-full max-w-xs items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {gameState === "playing"
            ? `已放 ${kingCount} / ${numRegions} 個國王`
            : "選擇難度開始"}
        </p>
        {gameState !== "idle" && (
          <Button size="sm" variant="outline" onClick={() => start(puzzleIdx)}>
            重置
          </Button>
        )}
      </div>

      {gameState === "idle" ? (
        <div className="max-w-xs space-y-1 py-6 text-center text-sm text-muted-foreground">
          <p>每個顏色區域恰好放一個 👑</p>
          <p>每行每列只能有一個 👑</p>
          <p>👑 之間不得相鄰（含對角線）</p>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl border"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${puzzle.size}, 1fr)`,
          }}
        >
          {puzzle.regions.map((row, r) =>
            row.map((regionId, c) => {
              const hasKing = placement[r]?.[c] ?? false
              const isViolation = violations.has(`${r},${c}`)
              const colorClass = REGION_COLORS[regionId] ?? "bg-muted"

              // Draw thick border between regions
              const borderTop =
                r > 0 && puzzle.regions[r - 1]?.[c] !== regionId
                  ? "border-t-2 border-t-foreground/60"
                  : "border-t border-t-foreground/10"
              const borderLeft =
                c > 0 && puzzle.regions[r]?.[c - 1] !== regionId
                  ? "border-l-2 border-l-foreground/60"
                  : "border-l border-l-foreground/10"

              return (
                <button
                  key={`${r},${c}`}
                  onClick={() => handleCellClick(r, c)}
                  className={`flex cursor-pointer items-center justify-center transition-colors select-none ${colorClass} ${borderTop} ${borderLeft} ${
                    isViolation ? "ring-2 ring-destructive ring-inset" : ""
                  }`}
                  style={{
                    width: puzzle.size === 6 ? 52 : 62,
                    height: puzzle.size === 6 ? 52 : 62,
                  }}
                >
                  {hasKing && (
                    <span
                      className={`text-2xl leading-none ${isViolation ? "opacity-60" : ""}`}
                    >
                      👑
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}

      {gameState === "won" && (
        <p className="font-semibold text-green-600">🎉 完美放置！</p>
      )}
    </div>
  )
}
