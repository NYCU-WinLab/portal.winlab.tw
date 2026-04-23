"use client"

import { useRef, useState } from "react"

import { IconX } from "@tabler/icons-react"

import type { ApproveField, SignerProfile } from "@/lib/approve/types"
import { getCategoryDef } from "@/lib/approve/field-categories"

import type { PageSize } from "./pdf-canvas"
import { SignerBadge, signerColor } from "./signer-badge"

export type FieldOverlayHandlers = {
  onMove: (
    id: string,
    patch: Partial<Pick<ApproveField, "x" | "y" | "width" | "height">>
  ) => void
  onReassign: (id: string, signerId: string) => void
  onRemove: (id: string) => void
}

export function FieldOverlay({
  fields,
  pageSize,
  signers,
  handlers,
}: {
  fields: ApproveField[]
  pageSize: PageSize
  signers: SignerProfile[]
  handlers: FieldOverlayHandlers
}) {
  return (
    <>
      {fields.map((f) => (
        <FieldBox
          key={f.id}
          field={f}
          pageSize={pageSize}
          signers={signers}
          handlers={handlers}
        />
      ))}
    </>
  )
}

function FieldBox({
  field,
  pageSize,
  signers,
  handlers,
}: {
  field: ApproveField
  pageSize: PageSize
  signers: SignerProfile[]
  handlers: FieldOverlayHandlers
}) {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef<{
    x: number
    y: number
    fx: number
    fy: number
  } | null>(null)
  const def = getCategoryDef(field.category)

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    setDragging(true)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, y: e.clientY, fx: field.x, fy: field.y }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !startRef.current) return
    const dx = (e.clientX - startRef.current.x) / pageSize.width
    const dy = (e.clientY - startRef.current.y) / pageSize.height
    handlers.onMove(field.id, {
      x: clamp01(startRef.current.fx + dx),
      y: clamp01(startRef.current.fy + dy),
    })
  }

  function onPointerUp(e: React.PointerEvent) {
    setDragging(false)
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    startRef.current = null
  }

  return (
    <div
      className="absolute rounded border-2 bg-background/40 text-[10px]"
      style={{
        left: field.x * pageSize.width,
        top: field.y * pageSize.height,
        width: field.width * pageSize.width,
        height: field.height * pageSize.height,
        borderColor: signerColor(field.signer_id),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="px-1">{def.label}</span>
      <SignerBadge
        signers={signers}
        currentId={field.signer_id}
        onChange={(id) => handlers.onReassign(field.id, id)}
      />
      <button
        type="button"
        aria-label="remove"
        onClick={(e) => {
          e.stopPropagation()
          handlers.onRemove(field.id)
        }}
        className="absolute -right-2 -bottom-2 rounded-full border bg-background p-0.5"
      >
        <IconX className="size-3" />
      </button>
      <ResizeHandle
        onDelta={(dw, dh) =>
          handlers.onMove(field.id, {
            width: clamp01(field.width + dw / pageSize.width),
            height: clamp01(field.height + dh / pageSize.height),
          })
        }
      />
    </div>
  )
}

function ResizeHandle({
  onDelta,
}: {
  onDelta: (dx: number, dy: number) => void
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      className="absolute right-0 bottom-0 size-2 cursor-se-resize bg-foreground"
      onPointerDown={(e) => {
        e.stopPropagation()
        ;(e.target as Element).setPointerCapture(e.pointerId)
        startRef.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerMove={(e) => {
        if (!startRef.current) return
        onDelta(e.clientX - startRef.current.x, e.clientY - startRef.current.y)
        startRef.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        startRef.current = null
        ;(e.target as Element).releasePointerCapture(e.pointerId)
      }}
    />
  )
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
