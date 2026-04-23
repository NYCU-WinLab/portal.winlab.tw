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
  const def = getCategoryDef(field.category)

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
      className="rounded border-2 bg-background/40"
      style={{ borderColor: signerColor(field.signer_id) }}
    >
      <div className="relative h-full w-full text-[10px]">
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
      </div>
    </Rnd>
  )
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
