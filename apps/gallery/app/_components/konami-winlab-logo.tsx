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

/** Konami overlay asset (public/). Change the path here if you rename the file. */
const KONAMI_IMAGE = "/konami-logo.gif"

/** Prefer e.code so arrow keys work regardless of locale / key layout quirks. */
function stepFromKeyboardEvent(e: KeyboardEvent): string | null {
  const code = e.code
  if (
    code === "ArrowUp" ||
    code === "ArrowDown" ||
    code === "ArrowLeft" ||
    code === "ArrowRight"
  ) {
    return code
  }
  const key = e.key
  if (key.length === 1) return key.toLowerCase()
  if (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight"
  ) {
    return key
  }
  return null
}

type DistortionParticle = {
  x: number
  y: number
  baseX: number
  baseY: number
  color: string
  density: number
  size: number
}

export function KonamiWinlabLogo() {
  const [visible, setVisible] = useState(false)
  const indexRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const openOverlay = useCallback(() => {
    clearSequenceTimerInternal()
    indexRef.current = 0
    setVisible(true)
  }, [])

  function clearSequenceTimerInternal() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const clearSequenceTimer = useCallback(() => {
    clearSequenceTimerInternal()
  }, [])

  const bumpSequenceTimer = useCallback(() => {
    clearSequenceTimerInternal()
    timeoutRef.current = setTimeout(() => {
      indexRef.current = 0
    }, 4000)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        !visible &&
        e.altKey &&
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        e.key.toLowerCase() === "w"
      ) {
        e.preventDefault()
        openOverlay()
        return
      }

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

      const pressed = stepFromKeyboardEvent(e)
      if (pressed === null) {
        clearSequenceTimerInternal()
        indexRef.current = 0
        return
      }

      const expected = SEQUENCE[indexRef.current]
      const first = SEQUENCE[0]

      if (pressed === expected) {
        e.preventDefault()
        indexRef.current += 1
        bumpSequenceTimer()
        if (indexRef.current >= SEQUENCE.length) {
          clearSequenceTimerInternal()
          indexRef.current = 0
          setVisible(true)
        }
      } else {
        const restart = pressed === first
        indexRef.current = restart ? 1 : 0
        if (restart) {
          e.preventDefault()
          bumpSequenceTimer()
        } else {
          clearSequenceTimerInternal()
        }
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      clearSequenceTimerInternal()
    }
  }, [visible, bumpSequenceTimer, clearSequenceTimer, openOverlay])

  useEffect(() => {
    if (visible) overlayRef.current?.focus()
  }, [visible])

  useEffect(() => {
    if (!visible) return

    const canvasEl = canvasRef.current
    const maybeCtx = canvasEl?.getContext("2d")
    if (!canvasEl || !maybeCtx) return
    const canvas = canvasEl
    const ctx = maybeCtx

    let cancelled = false
    let rafId = 0
    let removeResize: (() => void) | undefined
    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    let pointerActive = true

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointerActive = true
    }
    const onBlur = () => {
      pointerActive = false
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("blur", onBlur)

    const img = new Image()
    const startWithImage = () => {
      if (cancelled || !img.naturalWidth) return

      const mouseRadius = 90
      const maxDistance = 100
      let particles: DistortionParticle[] = []

      function layoutCanvasAndParticles() {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const vw = window.innerWidth
        const vh = window.innerHeight
        canvas.width = vw * dpr
        canvas.height = vh * dpr
        canvas.style.width = `${vw}px`
        canvas.style.height = `${vh}px`
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        const cx = vw / 2
        const cy = vh / 2
        const maxW = Math.min(320, Math.floor(vw * 0.85))
        const scale = maxW / img.naturalWidth
        const dw = Math.floor(img.naturalWidth * scale)
        const dh = Math.floor(img.naturalHeight * scale)

        const oc = document.createElement("canvas")
        oc.width = dw
        oc.height = dh
        const octx = oc.getContext("2d")
        if (!octx) return
        octx.drawImage(img, 0, 0, dw, dh)
        const imageData = octx.getImageData(0, 0, dw, dh).data

        let stride = 4
        const rebuild = (alphaCutoff: number) => {
          particles = []
          for (let y = 0; y < dh; y += stride) {
            for (let x = 0; x < dw; x += stride) {
              const idx = (y * dw + x) * 4
              const r = imageData[idx] ?? 0
              const g = imageData[idx + 1] ?? 0
              const b = imageData[idx + 2] ?? 0
              const a = imageData[idx + 3] ?? 0
              const darkEnough = r + g + b < 720
              if (a > alphaCutoff || (a > 20 && darkEnough)) {
                particles.push({
                  x: cx - dw / 2 + x,
                  y: cy - dh / 2 + y,
                  baseX: cx - dw / 2 + x,
                  baseY: cy - dh / 2 + y,
                  color: `rgb(${r},${g},${b})`,
                  density: 10 + Math.random() * 40,
                  size: 2,
                })
              }
            }
          }
        }
        let alphaCut = 128
        rebuild(alphaCut)
        if (particles.length === 0) {
          alphaCut = 8
          rebuild(alphaCut)
        }
        while (particles.length > 7000 && stride < 8) {
          stride += 1
          rebuild(alphaCut)
        }
      }

      layoutCanvasAndParticles()

      const onResize = () => {
        if (!cancelled) layoutCanvasAndParticles()
      }
      window.addEventListener("resize", onResize)
      removeResize = () => window.removeEventListener("resize", onResize)

      function tick() {
        if (cancelled) return
        const vw = window.innerWidth
        const vh = window.innerHeight
        ctx.clearRect(0, 0, vw, vh)

        for (const p of particles) {
          if (pointerActive) {
            const dx = pointer.x - p.x
            const dy = pointer.y - p.y
            const distance = Math.max(Math.hypot(dx, dy), 0.001)
            const forceDirectionX = dx / distance
            const forceDirectionY = dy / distance
            let force = (maxDistance - distance) / maxDistance
            if (force < 0) force = 0
            const directionX = forceDirectionX * force * p.density * 0.9
            const directionY = forceDirectionY * force * p.density * 0.9

            if (distance < mouseRadius + p.size) {
              p.x -= directionX
              p.y -= directionY
            } else {
              if (p.x !== p.baseX) p.x -= (p.x - p.baseX) / 5
              if (p.y !== p.baseY) p.y -= (p.y - p.baseY) / 5
            }
          } else {
            if (p.x !== p.baseX) p.x -= (p.x - p.baseX) / 5
            if (p.y !== p.baseY) p.y -= (p.y - p.baseY) / 5
          }

          ctx.fillStyle = p.color
          ctx.fillRect(p.x, p.y, p.size * 3, p.size * 3)
        }

        rafId = requestAnimationFrame(tick)
      }

      rafId = requestAnimationFrame(tick)
    }

    img.onload = () => startWithImage()
    img.src = KONAMI_IMAGE

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      removeResize?.()
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("blur", onBlur)
    }
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
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm duration-300 data-open:animate-in data-open:fade-in-0"
      data-open
      onClick={() => setVisible(false)}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0"
        aria-hidden
      />
    </div>
  )
}
