"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Classic Konami: ↑↑↓↓←→←→BA (letters case-insensitive). */
const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const

function normalizeKey(key: string): string {
  if (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight"
  ) {
    return key
  }
  return key.length === 1 ? key.toLowerCase() : key
}

export function KonamiWinlabLogo() {
  const [visible, setVisible] = useState(false)
  const indexRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const clearSequenceTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const bumpSequenceTimer = useCallback(() => {
    clearSequenceTimer()
    timeoutRef.current = setTimeout(() => {
      indexRef.current = 0
    }, 4000)
  }, [clearSequenceTimer])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (visible) {
        if (e.key === "Escape") {
          e.preventDefault()
          setVisible(false)
        }
        return
      }

      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      ) {
        return
      }

      const pressed = normalizeKey(e.key)
      const expected = SEQUENCE[indexRef.current]
      const firstKey = normalizeKey(SEQUENCE[0])

      if (pressed === expected) {
        // Stop arrow keys from scrolling the page while entering the code.
        e.preventDefault()
        indexRef.current += 1
        bumpSequenceTimer()
        if (indexRef.current >= SEQUENCE.length) {
          clearSequenceTimer()
          indexRef.current = 0
          setVisible(true)
        }
      } else {
        const restart = pressed === firstKey
        indexRef.current = restart ? 1 : 0
        if (restart) {
          e.preventDefault()
          bumpSequenceTimer()
        } else {
          clearSequenceTimer()
        }
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      clearSequenceTimer()
    }
  }, [visible, bumpSequenceTimer, clearSequenceTimer])

  useEffect(() => {
    if (visible) overlayRef.current?.focus()
  }, [visible])

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      id="konami-winlab-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="WinLab"
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/75 p-6 backdrop-blur-sm duration-300 data-open:animate-in data-open:fade-in-0"
      data-open
      onClick={() => setVisible(false)}
    >
      <div
        className="flex max-w-[min(90vw,28rem)] flex-col items-center duration-300 data-open:animate-in data-open:zoom-in-95"
        data-open
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && setVisible(false)}
      >
        <img
          src="/konami-logo.gif"
          alt="NYCU WinLab"
          width={320}
          height={320}
          className="h-auto w-full max-w-[320px] object-contain drop-shadow-2xl"
        />
        <p className="mt-6 max-w-sm text-center text-sm text-white/85 italic">
          Outside click or Esc to close.
        </p>
      </div>
    </div>
  )
}
