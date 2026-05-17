"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import type { GameResult } from "@/lib/games/types"

// --- Puzzle definitions ---
// regions[r][c] = region id; solution[r][c] = true if queen placed here
// All puzzles verified: 1 queen/row, 1/col, 1/region, no adjacency

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

function checkAdjacent(
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

function computeViolations(
  placement: boolean[][],
  regions: number[][],
  size: number
): Set<string> {
  const set = new Set<string>()
  if (!placement.length) return set

  const byRow = new Map<number, string[]>()
  const byCol = new Map<number, string[]>()
  const byRegion = new Map<number, string[]>()

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!placement[r]?.[c]) continue
      const key = `${r},${c}`
      const region = regions[r]![c]!
      if (!byRow.has(r)) byRow.set(r, [])
      byRow.get(r)!.push(key)
      if (!byCol.has(c)) byCol.set(c, [])
      byCol.get(c)!.push(key)
      if (!byRegion.has(region)) byRegion.set(region, [])
      byRegion.get(region)!.push(key)

      if (checkAdjacent(placement, r, c, size)) set.add(key)
    }
  }

  for (const group of [byRow, byCol, byRegion]) {
    for (const keys of group.values()) {
      if (keys.length > 1) for (const k of keys) set.add(k)
    }
  }
  return set
}

function isComplete(
  placement: boolean[][],
  regions: number[][],
  size: number
): boolean {
  const numRegions = new Set(regions.flat()).size
  if (computeViolations(placement, regions, size).size > 0) return false

  let total = 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (placement[r]?.[c]) total++
    }
  }
  return total === numRegions
}

interface GameQueensProps {
  onComplete: (result: GameResult) => void
}

export function GameQueens({ onComplete }: GameQueensProps) {
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

  const violations = useMemo(
    () => computeViolations(placement, puzzle.regions, puzzle.size),
    [placement, puzzle]
  )

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
      const ms = Date.now() - startRef.current!
      setGameState("won")
      setTimeout(
        () => onComplete({ score: puzzle.size, finishTimeMs: ms }),
        300
      )
    }
  }, [won, puzzle.size, onComplete])

  const queenCount = placement.flat().filter(Boolean).length
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
          {gameState === "won"
            ? `已完成 ${queenCount} / ${numRegions} 個皇后`
            : gameState === "playing"
              ? `已放 ${queenCount} / ${numRegions} 個皇后`
              : "選擇難度開始"}
        </p>
        {gameState !== "idle" && (
          <Button size="sm" variant="outline" onClick={() => start(puzzleIdx)}>
            重新開始
          </Button>
        )}
      </div>

      {gameState === "idle" ? (
        <div className="max-w-xs space-y-1 py-6 text-center text-sm text-muted-foreground">
          <p>每個顏色區域恰好放一個 ♛</p>
          <p>每行每列只能有一個 ♛</p>
          <p>♛ 之間不得相鄰（含對角線）</p>
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
              const hasQueen = placement[r]?.[c] ?? false
              const isViolation = violations.has(`${r},${c}`)
              const colorClass = REGION_COLORS[regionId] ?? "bg-muted"

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
                  aria-label={`第 ${r + 1} 行第 ${c + 1} 列，區域 ${regionId + 1}${hasQueen ? "，已放皇后" : ""}${isViolation ? "（違規）" : ""}`}
                  aria-pressed={hasQueen}
                  disabled={gameState !== "playing"}
                  className={`relative flex cursor-pointer items-center justify-center transition-colors select-none ${colorClass} ${borderTop} ${borderLeft} ${
                    isViolation ? "ring-2 ring-destructive ring-inset" : ""
                  } disabled:cursor-default`}
                  style={{
                    width: puzzle.size === 6 ? 52 : 62,
                    height: puzzle.size === 6 ? 52 : 62,
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute top-0.5 left-1 text-[10px] font-semibold text-foreground/40 tabular-nums"
                  >
                    {regionId + 1}
                  </span>
                  {hasQueen && (
                    <span
                      className={`text-2xl leading-none select-none ${isViolation ? "opacity-50" : ""}`}
                    >
                      ♛
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
