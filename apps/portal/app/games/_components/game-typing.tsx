"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import type { GameResult } from "@/lib/games/types"

const PASSAGES = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.",
  "Programming is the art of telling another human what one wants the computer to do. Clean code always looks like it was written by someone who cares.",
  "Science is not only a disciple of reason but also one of romance and passion. The universe is under no obligation to make sense to you.",
]

function pickPassage(): string {
  return PASSAGES[Math.floor(Math.random() * PASSAGES.length)] ?? PASSAGES[0]!
}

type State = "idle" | "playing" | "done"

interface GameTypingProps {
  onComplete: (result: GameResult) => void
}

export function GameTyping({ onComplete }: GameTypingProps) {
  const [target, setTarget] = useState("")
  const [input, setInput] = useState("")
  const [state, setState] = useState<State>("idle")
  const startRef = useRef<number | null>(null)
  const completedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const start = useCallback(() => {
    completedRef.current = false
    setTarget(pickPassage())
    setInput("")
    setState("playing")
    startRef.current = null
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (state !== "playing") return
      const val = e.target.value

      // Reject sudden large inserts (paste, IME drop) — > 4 chars added at once
      if (val.length - input.length > 4) return

      if (!startRef.current) startRef.current = Date.now()

      setInput(val)

      if (val === target && !completedRef.current) {
        completedRef.current = true
        const ms = Math.max(Date.now() - startRef.current, 1)
        const words = target.trim().split(/\s+/).length
        const wpm = Math.round((words / ms) * 60000)
        setState("done")
        // Floor at 1s to defeat instant-fill exploits; cap WPM at 300 sanity check
        if (ms >= 1000 && wpm <= 300) {
          setTimeout(
            () => onComplete({ score: wpm * 10, finishTimeMs: ms }),
            100
          )
        }
      }
    },
    [state, target, input, onComplete]
  )

  const correctCount = input
    .split("")
    .filter((ch, i) => ch === target[i]).length
  const accuracy =
    input.length > 0 ? Math.round((correctCount / input.length) * 100) : 100

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          準確率{" "}
          <span
            className={`font-bold ${accuracy < 80 ? "text-destructive" : "text-foreground"}`}
          >
            {accuracy}%
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={start}>
          {state === "idle" ? "開始遊戲" : "重新開始"}
        </Button>
      </div>

      {state === "idle" ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          點擊「開始遊戲」，盡快完整輸入以下段落
        </p>
      ) : (
        <>
          <div className="rounded-xl border bg-muted/30 p-4 font-mono text-sm leading-relaxed select-none">
            {target.split("").map((ch, i) => {
              let cls = "text-muted-foreground"
              if (i < input.length) {
                cls =
                  input[i] === ch
                    ? "text-green-600"
                    : "text-destructive bg-red-100 dark:bg-red-900/30"
              } else if (i === input.length) {
                cls = "border-b-2 border-primary text-foreground"
              }
              return (
                <span key={i} className={cls}>
                  {ch}
                </span>
              )
            })}
          </div>

          <input
            ref={inputRef}
            value={input}
            onChange={handleChange}
            onPaste={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
            disabled={state === "done"}
            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm ring-1 ring-muted outline-none focus:ring-primary"
            placeholder="在此輸入..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="text"
          />
        </>
      )}

      {state === "done" && (
        <p className="text-center font-semibold text-green-600">🎉 完成！</p>
      )}
    </div>
  )
}
