"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"
import type {
  ApproveField,
  FieldCategory,
  SignerProfile,
} from "@/lib/approve/types"
import { getCategoryDef } from "@/lib/approve/field-categories"

import { deleteField, submitDocument, upsertField } from "../actions"

import { FieldOverlay } from "./field-overlay"
import { FieldPalette } from "./field-palette"
import { PdfCanvas } from "./pdf-canvas"
import { SignerPicker } from "./signer-picker"
import { TitleInput } from "./title-input"
import { UploadZone } from "./upload-zone"

export function DocumentEditor({
  documentId,
  initialTitle,
  initialFilePath,
  initialSignerIds,
  initialFields,
  initialSignerProfiles,
}: {
  documentId: string
  initialTitle: string
  initialFilePath: string | null
  initialSignerIds: string[]
  initialFields: ApproveField[]
  initialSignerProfiles: SignerProfile[]
}) {
  const [filePath, setFilePath] = useState(initialFilePath)
  const [signerIds, setSignerIds] = useState(initialSignerIds)
  const [signerProfiles, setSignerProfiles] = useState(initialSignerProfiles)
  const [fields, setFields] = useState(initialFields)
  const [page, setPage] = useState(1)
  const [palette, setPalette] = useState<FieldCategory | null>(null)

  const debounceRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const signedUrl = useSignedUrl(filePath, documentId)

  const fieldsOnPage = useMemo(
    () => fields.filter((f) => f.page === page),
    [fields, page]
  )

  const scheduleSave = useCallback(
    (field: ApproveField) => {
      const existing = debounceRefs.current.get(field.id)
      if (existing) clearTimeout(existing)
      const t = setTimeout(async () => {
        try {
          await upsertField({
            id: field.id,
            documentId,
            signerId: field.signer_id,
            page: field.page,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
            category: field.category,
            label: field.label,
          })
        } catch (e) {
          toast.error((e as Error).message)
        }
      }, 500)
      debounceRefs.current.set(field.id, t)
    },
    [documentId]
  )

  function onMove(id: string, patch: Partial<ApproveField>) {
    setFields((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
      const moved = next.find((f) => f.id === id)
      if (moved) scheduleSave(moved)
      return next
    })
  }

  function onReassign(id: string, signerId: string) {
    setFields((prev) => {
      const next = prev.map((f) =>
        f.id === id ? { ...f, signer_id: signerId } : f
      )
      const moved = next.find((f) => f.id === id)
      if (moved) scheduleSave(moved)
      return next
    })
  }

  async function onRemove(id: string) {
    const prev = fields
    setFields(prev.filter((f) => f.id !== id))
    try {
      await deleteField(documentId, id)
    } catch (e) {
      setFields(prev)
      toast.error((e as Error).message)
    }
  }

  function onCanvasClick(
    e: React.MouseEvent,
    size: { width: number; height: number }
  ) {
    if (!palette) return
    if (signerIds.length === 0) {
      toast.error("先加 signer")
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const def = getCategoryDef(palette)
    const nx = (e.clientX - rect.left) / size.width
    const ny = (e.clientY - rect.top) / size.height
    const newField: ApproveField = {
      id: crypto.randomUUID(),
      document_id: documentId,
      signer_id: signerIds[0]!,
      page,
      x: clamp01(nx - def.defaultSize.width / 2),
      y: clamp01(ny - def.defaultSize.height / 2),
      width: def.defaultSize.width,
      height: def.defaultSize.height,
      category: palette,
      label: palette === "other" ? "請填寫" : null,
      value: null,
      signed_at: null,
      created_at: new Date().toISOString(),
    }
    setFields((prev) => [...prev, newField])
    scheduleSave(newField)
  }

  async function onSubmit() {
    try {
      await submitDocument(documentId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <TitleInput documentId={documentId} initial={initialTitle} />
        <Button type="button" onClick={onSubmit}>
          送出
        </Button>
      </div>

      <div>
        <div className="mb-1 text-xs text-muted-foreground">Signers</div>
        <SignerPicker
          documentId={documentId}
          initialSignerIds={signerIds}
          onChange={async (ids) => {
            setSignerIds(ids)
            // Refresh profiles list for overlay badges
            const supabase = createClient()
            const { data } = await supabase
              .from("user_profiles")
              .select(`id, name, email, member:members!inner(avatar_url, role)`)
              .in("id", ids)
            setSignerProfiles(
              (data ?? []).map((row) => {
                const r = row as typeof row & {
                  id: string
                  name: string | null
                  email: string | null
                  member?: { avatar_url: string | null; role: string | null }
                }
                return {
                  id: r.id,
                  name: r.name ?? r.email ?? "Unknown",
                  email: r.email ?? null,
                  avatar_url: r.member?.avatar_url ?? null,
                  role: r.member?.role ?? null,
                }
              })
            )
          }}
        />
      </div>

      {!filePath ? (
        <UploadZone documentId={documentId} onUploaded={setFilePath} />
      ) : (
        <div className="flex gap-4">
          <FieldPalette activeCategory={palette} onPick={setPalette} />
          <div className="flex-1">
            {signedUrl ? (
              <PdfCanvas fileUrl={signedUrl} page={page} onPageChange={setPage}>
                {(size) => (
                  <div
                    className="h-full w-full"
                    onClick={(e) => onCanvasClick(e, size)}
                    style={{ cursor: palette ? "crosshair" : "default" }}
                  >
                    <FieldOverlay
                      fields={fieldsOnPage}
                      pageSize={size}
                      signers={signerProfiles}
                      handlers={{ onMove, onReassign, onRemove }}
                    />
                  </div>
                )}
              </PdfCanvas>
            ) : (
              <p className="text-muted-foreground">載入 PDF...</p>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function useSignedUrl(filePath: string | null, documentId: string) {
  const [url, setUrl] = useState<string | null>(null)
  useMemo(() => {
    if (!filePath) {
      setUrl(null)
      return
    }
    const supabase = createClient()
    supabase.storage
      .from(APPROVE_BUCKET)
      .createSignedUrl(documentStoragePath(documentId), 60 * 30)
      .then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [filePath, documentId])
  return url
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
