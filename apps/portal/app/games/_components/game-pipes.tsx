"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import type { GameResult } from "@/lib/games/types"

// Bitmask: bit0=top, bit1=right, bit2=bottom, bit3=left
const TOP = 1,
  RIGHT = 2,
  BOTTOM = 4,
  LEFT = 8
const GRID = 6

function rotateCW(mask: number, times = 1): number {
  let m = mask
  for (let i = 0; i < times; i++) m = ((m << 1) | (m >> 3)) & 0xf
  return m
}

function generateSolved(
  rows: number,
  cols: number,
  sr: number,
  sc: number
): number[][] {
  const grid = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
  const visited = new Set<string>()

  function dfs(r: number, c: number) {
    visited.add(`${r},${c}`)
    const dirs = [
      { dr: -1, dc: 0, from: TOP, to: BOTTOM },
      { dr: 0, dc: 1, from: RIGHT, to: LEFT },
      { dr: 1, dc: 0, from: BOTTOM, to: TOP },
      { dr: 0, dc: -1, from: LEFT, to: RIGHT },
    ].sort(() => Math.random() - 0.5)

    for (const { dr, dc, from, to } of dirs) {
      const nr = r + dr,
        nc = c + dc
      if (
        nr >= 0 &&
        nr < rows &&
        nc >= 0 &&
        nc < cols &&
        !visited.has(`${nr},${nc}`)
      ) {
        grid[r]![c]! |= from
        grid[nr]![nc]! |= to
        dfs(nr, nc)
      }
    }
  }

  dfs(sr, sc)
  return grid
}

function getConnected(
  masks: number[][],
  source: [number, number],
  rows: number,
  cols: number
): Set<string> {
  const [sr, sc] = source
  const visited = new Set<string>([`${sr},${sc}`])
  const q: [number, number][] = [[sr, sc]]

  while (q.length) {
    const [r, c] = q.shift()!
    const m = masks[r]?.[c] ?? 0
    const neighbors: [number, number, number, number][] = [
      [-1, 0, TOP, BOTTOM],
      [0, 1, RIGHT, LEFT],
      [1, 0, BOTTOM, TOP],
      [0, -1, LEFT, RIGHT],
    ]
    for (const [dr, dc, cm, nm] of neighbors) {
      const nr = r + dr,
        nc = c + dc
      if (
        nr >= 0 &&
        nr < rows &&
        nc >= 0 &&
        nc < cols &&
        m & cm &&
        (masks[nr]?.[nc] ?? 0) & nm
      ) {
        const key = `${nr},${nc}`
        if (!visited.has(key)) {
          visited.add(key)
          q.push([nr, nc])
        }
      }
    }
  }
  return visited
}

function PipeSVG({
  mask,
  isSource,
  connected,
}: {
  mask: number
  isSource: boolean
  connected: boolean
}) {
  const color = connected ? "#3b82f6" : "#9ca3af"
  const sw = 7
  const numConn = [TOP, RIGHT, BOTTOM, LEFT].filter((b) => mask & b).length
  const isEndpoint = numConn === 1

  let ex = 20,
    ey = 20
  if (isEndpoint) {
    if (mask & TOP) ey = 4
    else if (mask & RIGHT) ex = 36
    else if (mask & BOTTOM) ey = 36
    else ex = 4
  }

  return (
    <svg viewBox="0 0 40 40" className="h-full w-full">
      {!!(mask & TOP) && (
        <line
          x1="20"
          y1="20"
          x2="20"
          y2="0"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {!!(mask & RIGHT) && (
        <line
          x1="20"
          y1="20"
          x2="40"
          y2="20"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {!!(mask & BOTTOM) && (
        <line
          x1="20"
          y1="20"
          x2="20"
          y2="40"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {!!(mask & LEFT) && (
        <line
          x1="20"
          y1="20"
          x2="0"
          y2="20"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {isSource ? (
        <circle
          cx="20"
          cy="20"
          r="7"
          fill="#2563eb"
          stroke="white"
          strokeWidth="2"
        />
      ) : isEndpoint ? (
        <circle
          cx={ex}
          cy={ey}
          r="5"
          fill={connected ? "#22c55e" : "#d1d5db"}
          stroke={color}
          strokeWidth="2"
        />
      ) : null}
    </svg>
  )
}

interface GamePipesProps {
  onComplete: (result: GameResult) => void
}

export function GamePipes({ onComplete }: GamePipesProps) {
  const [solved, setSolved] = useState<number[][]>([])
  const [current, setCurrent] = useState<number[][]>([])
  const [source, setSource] = useState<[number, number]>([2, 2])
  const [gameState, setGameState] = useState<"idle" | "playing" | "won">("idle")
  const startRef = useRef<number | null>(null)
  const completedRef = useRef(false)

  const start = useCallback(() => {
    completedRef.current = false
    const sr = Math.floor(GRID / 2),
      sc = Math.floor(GRID / 2)
    const solvedGrid = generateSolved(GRID, GRID, sr, sc)
    const scrambled = solvedGrid.map((row) =>
      row.map((mask) =>
        mask ? rotateCW(mask, Math.floor(Math.random() * 4)) : 0
      )
    )
    setSolved(solvedGrid)
    setCurrent(scrambled)
    setSource([sr, sc])
    setGameState("playing")
    startRef.current = Date.now()
  }, [])

  const connected = useMemo(() => {
    if (!current.length) return new Set<string>()
    return getConnected(current, source, GRID, GRID)
  }, [current, source])

  const endpoints = useMemo(() => {
    const eps: [number, number][] = []
    solved.forEach((row, r) =>
      row.forEach((mask, c) => {
        if (r === source[0] && c === source[1]) return
        const count = [TOP, RIGHT, BOTTOM, LEFT].filter((b) => mask & b).length
        if (count === 1) eps.push([r, c])
      })
    )
    return eps
  }, [solved, source])

  const isWon = useMemo(
    () =>
      gameState === "playing" &&
      endpoints.length > 0 &&
      endpoints.every(([r, c]) => connected.has(`${r},${c}`)),
    [endpoints, connected, gameState]
  )

  useEffect(() => {
    if (isWon && !completedRef.current) {
      completedRef.current = true
      const ms = Date.now() - (startRef.current ?? Date.now())
      setGameState("won")
      setTimeout(
        () => onComplete({ score: endpoints.length, finishTimeMs: ms }),
        300
      )
    }
  }, [isWon, endpoints, onComplete])

  const handleClick = useCallback(
    (r: number, c: number) => {
      if (gameState !== "playing" || (r === source[0] && c === source[1]))
        return
      setCurrent((prev) => {
        const next = prev.map((row) => [...row])
        next[r]![c] = rotateCW(next[r]![c]!)
        return next
      })
    },
    [gameState, source]
  )

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-xs items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {gameState === "playing"
            ? `連接 ${endpoints.filter(([r, c]) => connected.has(`${r},${c}`)).length} / ${endpoints.length} 個端點`
            : "點擊管道旋轉，讓所有端點（圓點）連通"}
        </p>
        <Button size="sm" variant="outline" onClick={start}>
          {gameState === "idle" ? "開始遊戲" : "重新開始"}
        </Button>
      </div>

      {gameState === "idle" ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          按下開始，旋轉管道讓水從藍色源頭流到所有端點
        </p>
      ) : (
        <div
          className="rounded-xl border bg-muted/20 p-2"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${GRID}, 50px)`,
            gap: "2px",
          }}
        >
          {current.map((row, r) =>
            row.map((mask, c) => {
              const isSrc = r === source[0] && c === source[1]
              const isConn = connected.has(`${r},${c}`)
              return (
                <button
                  key={`${r},${c}`}
                  onClick={() => handleClick(r, c)}
                  disabled={isSrc || gameState !== "playing"}
                  aria-label={
                    isSrc
                      ? "水源"
                      : `第 ${r + 1} 行第 ${c + 1} 列管道，點擊旋轉`
                  }
                  className={`rounded transition-colors ${
                    isConn
                      ? "bg-blue-50 dark:bg-blue-950/40"
                      : "bg-muted/40 hover:bg-muted"
                  } disabled:cursor-default`}
                  style={{ width: 50, height: 50 }}
                >
                  <PipeSVG mask={mask} isSource={isSrc} connected={isConn} />
                </button>
              )
            })
          )}
        </div>
      )}

      {gameState === "won" && (
        <p className="font-semibold text-green-600">🎉 水管全部連通！</p>
      )}
    </div>
  )
}
