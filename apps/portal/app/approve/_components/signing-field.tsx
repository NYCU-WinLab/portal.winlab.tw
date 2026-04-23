"use client"

import type { ApproveField } from "@/lib/approve/types"
import { getCategoryDef } from "@/lib/approve/field-categories"

import type { PageSize } from "./pdf-canvas"
import { SignaturePad } from "./signature-pad"

export function SigningField({
  field,
  pageSize,
  value,
  savedSignature,
  onChange,
}: {
  field: ApproveField
  pageSize: PageSize
  value: string
  savedSignature: string | null
  onChange: (next: string) => void
}) {
  const def = getCategoryDef(field.category)
  const style: React.CSSProperties = {
    left: field.x * pageSize.width,
    top: field.y * pageSize.height,
    width: field.width * pageSize.width,
    height: field.height * pageSize.height,
  }

  if (field.category === "signature") {
    return (
      <div className="absolute rounded border bg-background" style={style}>
        {value ? (
          <SignaturePad
            savedSignature={savedSignature}
            onConfirm={onChange}
            trigger={
              <button type="button" className="block h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={value}
                  alt="signature"
                  className="h-full w-full object-contain"
                />
              </button>
            }
          />
        ) : (
          <SignaturePad
            savedSignature={savedSignature}
            onConfirm={onChange}
            trigger={
              <button
                type="button"
                className="h-full w-full rounded-none text-xs text-muted-foreground hover:bg-muted/40"
              >
                點擊簽名
              </button>
            }
          />
        )}
      </div>
    )
  }

  return (
    <div className="absolute rounded border bg-background" style={style}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.label ?? def.label}
        className="h-full w-full bg-transparent px-1 text-xs outline-none"
      />
    </div>
  )
}
