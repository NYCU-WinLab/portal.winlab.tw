"use client"

import { Rnd } from "react-rnd"

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
  candidates,
  handlers,
}: {
  fields: ApproveField[]
  pageSize: PageSize
  candidates: SignerProfile[]
  handlers: FieldOverlayHandlers
}) {
  return (
    <>
      {fields.map((f) => (
        <FieldBox
          key={f.id}
          field={f}
          pageSize={pageSize}
          candidates={candidates}
          handlers={handlers}
        />
      ))}
    </>
  )
}

function FieldBox({
  field,
  pageSize,
  candidates,
  handlers,
}: {
  field: ApproveField
  pageSize: PageSize
  candidates: SignerProfile[]
  handlers: FieldOverlayHandlers
}) {
  const def = getCategoryDef(field.category)
  const border = signerColor(field.signer_id)

  return (
    <Rnd
      size={{
        width: field.width * pageSize.width,
        height: field.height * pageSize.height,
      }}
      position={{
        x: field.x * pageSize.width,
        y: field.y * pageSize.height,
      }}
      bounds="parent"
      cancel=".no-drag"
      onDragStop={(_e, d) => {
        handlers.onMove(field.id, {
          x: clamp01(d.x / pageSize.width),
          y: clamp01(d.y / pageSize.height),
        })
      }}
      onResizeStop={(_e, _dir, ref, _delta, position) => {
        handlers.onMove(field.id, {
          x: clamp01(position.x / pageSize.width),
          y: clamp01(position.y / pageSize.height),
          width: clamp01(ref.offsetWidth / pageSize.width),
          height: clamp01(ref.offsetHeight / pageSize.height),
        })
      }}
      className={
        "rounded bg-background/40 " +
        (field.signer_id ? "border-2" : "border-2 border-dashed")
      }
      style={{ borderColor: border }}
    >
      <div className="relative flex h-full w-full items-start justify-between gap-1 p-0.5">
        <SignerBadge
          label={def.label}
          candidates={candidates}
          currentId={field.signer_id}
          onChange={(id) => handlers.onReassign(field.id, id)}
        />
        <button
          type="button"
          aria-label="remove"
          className="no-drag flex size-4 items-center justify-center rounded bg-background/80 hover:bg-background"
          onClick={(e) => {
            e.stopPropagation()
            handlers.onRemove(field.id)
          }}
        >
          <IconX className="size-3" />
        </button>
      </div>
    </Rnd>
  )
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
