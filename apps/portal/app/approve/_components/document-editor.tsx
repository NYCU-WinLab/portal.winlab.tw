"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
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

import {
  deleteField,
  deleteDocument,
  submitDocument,
  upsertField,
} from "../actions"

import { FieldOverlay } from "./field-overlay"
import { FieldPalette } from "./field-palette"
import { SignerPicker } from "./signer-picker"
import { ConfirmDialog } from "./confirm-dialog"
import { TitleInput } from "./title-input"
import { UploadZone } from "./upload-zone"

// pdfjs uses Promise.withResolvers (Node 22+). Loading client-side only so
// SSR on Node 20 doesn't crash.
const PdfCanvas = dynamic(
  () => import("./pdf-canvas").then((m) => ({ default: m.PdfCanvas })),
  {
    ssr: false,
    loading: () => <p className="text-muted-foreground">載入 PDF...</p>,
  }
)

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

  const router = useRouter()

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

  function onPlaceField(category: FieldCategory) {
    if (signerIds.length === 0) {
      toast.error("先加 signer")
      return
    }
    const def = getCategoryDef(category)
    const newField: ApproveField = {
      id: crypto.randomUUID(),
      document_id: documentId,
      signer_id: signerIds[0]!,
      page,
      x: clamp01(0.5 - def.defaultSize.width / 2),
      y: clamp01(0.5 - def.defaultSize.height / 2),
      width: def.defaultSize.width,
      height: def.defaultSize.height,
      category,
      label: category === "other" ? "請填寫" : null,
      value: null,
      signed_at: null,
      created_at: new Date().toISOString(),
    }
    setFields((prev) => [...prev, newField])
    scheduleSave(newField)
  }

  async function onSubmit() {
    const { validateForSubmit } = await import("@/lib/approve/validation")
    const v = validateForSubmit({
      title: initialTitle,
      filePath,
      signers: signerIds.map((id) => ({
        id: "",
        document_id: documentId,
        signer_id: id,
        status: "pending" as const,
        signed_at: null,
        created_at: "",
      })),
      fields,
    })
    if (!v.ok) {
      toast.error(v.reason)
      return
    }
    try {
      await submitDocument(documentId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <TitleInput documentId={documentId} initial={initialTitle} />
        <div className="flex items-center gap-2">
          <ConfirmDialog
            trigger={<Button variant="outline">刪除草稿</Button>}
            title="刪除草稿？"
            description="刪了就沒了。"
            confirmText="刪除"
            variant="destructive"
            onConfirm={async () => {
              try {
                await deleteDocument(documentId)
                router.push("/approve")
              } catch (e) {
                toast.error((e as Error).message)
              }
            }}
          />
          <Button type="button" onClick={onSubmit}>
            送出
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs text-muted-foreground">Signers</div>
        <SignerPicker
          documentId={documentId}
          initialSignerIds={signerIds}
          onChange={async (ids) => {
            setSignerIds(ids)
            if (ids.length === 0) {
              setSignerProfiles([])
              return
            }
            // Refresh profiles list for overlay badges. members ↔ user_profiles
            // has no FK so we can't resource-embed; do two queries + left join
            // by email in JS.
            const supabase = createClient()
            const { data: profiles } = await supabase
              .from("user_profiles")
              .select("id, name, email")
              .in("id", ids)
            const emails = (profiles ?? [])
              .map((p) => p.email?.toLowerCase())
              .filter((e): e is string => !!e)
            const enrich = new Map<
              string,
              { avatar_url: string | null; role: string | null }
            >()
            if (emails.length) {
              const { data: members } = await supabase
                .from("members")
                .select("email, avatar_url, role")
                .in("email", emails)
              for (const m of members ?? []) {
                if (m.email)
                  enrich.set(m.email.toLowerCase(), {
                    avatar_url: m.avatar_url,
                    role: m.role,
                  })
              }
            }
            setSignerProfiles(
              (profiles ?? []).map((p) => {
                const m = enrich.get(p.email?.toLowerCase() ?? "")
                return {
                  id: p.id,
                  name: p.name ?? p.email ?? "Unknown",
                  email: p.email ?? null,
                  avatar_url: m?.avatar_url ?? null,
                  role: m?.role ?? null,
                }
              })
            )
          }}
        />
      </div>

      {!filePath ? (
        <UploadZone documentId={documentId} onUploaded={setFilePath} />
      ) : (
        <div className="flex flex-col gap-3">
          <FieldPalette onPlace={onPlaceField} />
          {signedUrl ? (
            <PdfCanvas fileUrl={signedUrl} page={page} onPageChange={setPage}>
              {(size) => (
                <FieldOverlay
                  fields={fieldsOnPage}
                  pageSize={size}
                  signers={signerProfiles}
                  handlers={{ onMove, onReassign, onRemove }}
                />
              )}
            </PdfCanvas>
          ) : (
            <p className="text-muted-foreground">載入 PDF...</p>
          )}
        </div>
      )}
    </div>
  )
}

function useSignedUrl(filePath: string | null, documentId: string) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
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
