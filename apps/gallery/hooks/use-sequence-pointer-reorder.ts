"use client"

import { useCallback, useRef, type PointerEvent } from "react"

/**
 * Pointer-based reorder for Manage sequence rows (mouse + touch).
 * Bind handlers to a dedicated grip handle so the rest of the row still scrolls.
 */
export function useSequencePointerReorder({
  itemCount,
  disabled,
  onReorder,
}: {
  itemCount: number
  disabled?: boolean
  onReorder: (fromIndex: number, toIndex: number) => void
}) {
  const listRef = useRef<HTMLUListElement | null>(null)
  const dragFromRef = useRef<number | null>(null)
  const activePointerIdRef = useRef<number | null>(null)

  const clearDrag = useCallback(() => {
    dragFromRef.current = null
    activePointerIdRef.current = null
    listRef.current
      ?.querySelectorAll("[data-sequence-drop-target]")
      .forEach((node) => {
        node.removeAttribute("data-sequence-drop-target")
      })
  }, [])

  const indexFromPoint = useCallback((clientY: number) => {
    const list = listRef.current
    if (!list) return null
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>("[data-sequence-index]")
    )
    if (rows.length === 0) return null

    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      if (clientY < mid) {
        const index = Number(row.dataset.sequenceIndex)
        return Number.isFinite(index) ? index : null
      }
    }

    const last = rows[rows.length - 1]
    const index = Number(last?.dataset.sequenceIndex)
    return Number.isFinite(index) ? index : null
  }, [])

  const highlightTarget = useCallback((targetIndex: number | null) => {
    const list = listRef.current
    if (!list) return
    list.querySelectorAll("[data-sequence-index]").forEach((node) => {
      const el = node as HTMLElement
      const index = Number(el.dataset.sequenceIndex)
      if (targetIndex != null && index === targetIndex) {
        el.setAttribute("data-sequence-drop-target", "true")
      } else {
        el.removeAttribute("data-sequence-drop-target")
      }
    })
  }, [])

  const onHandlePointerDown = useCallback(
    (index: number, event: PointerEvent<HTMLElement>) => {
      if (disabled) return
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      dragFromRef.current = index
      activePointerIdRef.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      highlightTarget(index)
    },
    [disabled, highlightTarget]
  )

  const onHandlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return
      if (dragFromRef.current == null) return
      const target = indexFromPoint(event.clientY)
      highlightTarget(target)
    },
    [highlightTarget, indexFromPoint]
  )

  const finishPointer = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return
      const from = dragFromRef.current
      const to = indexFromPoint(event.clientY)
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // capture may already be released
      }
      clearDrag()
      if (from == null || to == null || from === to) return
      if (to < 0 || to >= itemCount) return
      onReorder(from, to)
    },
    [clearDrag, indexFromPoint, itemCount, onReorder]
  )

  return {
    listRef,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp: finishPointer,
    onHandlePointerCancel: finishPointer,
  }
}
