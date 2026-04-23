"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
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
  deleteDocument,
  deleteField,
  submitDocument,
  syncSigners,
  upsertField,
} from "../actions"

import { ConfirmDialog } from "./confirm-dialog"
import { FieldOverlay } from "./field-overlay"
import { FieldPalette } from "./field-palette"
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
  initialFields,
}: {
  documentId: string
  initialTitle: string
  initialFilePath: string | null
  initialFields: ApproveField[]
}) {
  const [filePath, setFilePath] = useState(initialFilePath)
  const [fields, setFields] = useState(initialFields)
  const [page, setPage] = useState(1)
  const [candidates, setCandidates] = useState<SignerProfile[]>([])
  // Remember the last signer the user assigned so new boxes auto-inherit it.
  // Seed from existing fields so reopening a draft continues the flow.
  const [lastSignerId, setLastSignerId] = useState<string | null>(() => {
    const withSigner = initialFields.filter((f) => f.signer_id)
    return withSigner.at(-1)?.signer_id ?? null
  })

  const router = useRouter()
  const queryClient = useQueryClient()
  const debounceRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const signedUrl = useSignedUrl(filePath, documentId)

  // Load all users once for the SignerBadge popover.
  useEffect(() => {
    ;(async () => {
      const supabase = createClient()
      const { data: profiles, error } = await supabase
        .from("user_profiles")
        .select("id, name, email")
        .order("name", { ascending: true, nullsFirst: false })
      if (error) {
        toast.error(error.message)
        return
      }
      const emails = (profiles ?? [])
        .map((p) => p.email?.toLowerCase())
        .filter((e): e is string => !!e)
      const avatarByEmail = new Map<string, string | null>()
      const roleByEmail = new Map<string, string | null>()
      if (emails.length) {
        const { data: members } = await supabase
          .from("members")
          .select("email, avatar_url, role")
          .in("email", emails)
        for (const m of members ?? []) {
          if (m.email) {
            avatarByEmail.set(m.email.toLowerCase(), m.avatar_url)
            roleByEmail.set(m.email.toLowerCase(), m.role)
          }
        }
      }
      setCandidates(
        (profiles ?? []).map((p) => ({
          id: p.id,
          name: p.name ?? p.email ?? "Unknown",
          email: p.email ?? null,
          avatar_url: avatarByEmail.get(p.email?.toLowerCase() ?? "") ?? null,
          role: roleByEmail.get(p.email?.toLowerCase() ?? "") ?? null,
        }))
      )
    })()
  }, [])

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

  async function onReassign(id: string, signerId: string) {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, signer_id: signerId } : f))
    )
    setLastSignerId(signerId)
    try {
      const current = fields.find((f) => f.id === id)
      if (!current) return
      await upsertField({
        id,
        documentId,
        signerId,
        page: current.page,
        x: current.x,
        y: current.y,
        width: current.width,
        height: current.height,
        category: current.category,
        label: current.label,
      })
      await syncSigners(documentId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function onRemove(id: string) {
    const prev = fields
    setFields(prev.filter((f) => f.id !== id))
    try {
      await deleteField(documentId, id)
      await syncSigners(documentId)
    } catch (e) {
      setFields(prev)
      toast.error((e as Error).message)
    }
  }

  function onPlaceField(category: FieldCategory) {
    const def = getCategoryDef(category)
    const newField: ApproveField = {
      id: crypto.randomUUID(),
      document_id: documentId,
      signer_id: lastSignerId,
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
      fields,
    })
    if (!v.ok) {
      toast.error(v.reason)
      return
    }
    try {
      // Flush any pending debounced saves and re-sync every field so the
      // server sees the latest signer assignments before it validates.
      for (const timer of debounceRefs.current.values()) clearTimeout(timer)
      debounceRefs.current.clear()
      await Promise.all(
        fields.map((f) =>
          upsertField({
            id: f.id,
            documentId,
            signerId: f.signer_id,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            category: f.category,
            label: f.label,
          })
        )
      )
      await submitDocument(documentId)
      await queryClient.invalidateQueries({ queryKey: ["approve"] })
      router.push("/approve")
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
            trigger={
              <Button variant="outline" size="sm">
                刪除草稿
              </Button>
            }
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
          <Button type="button" size="sm" onClick={onSubmit}>
            送出
          </Button>
        </div>
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
                  candidates={candidates}
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
