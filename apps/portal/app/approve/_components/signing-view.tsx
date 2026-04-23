"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"
import type {
  ApproveDocument,
  ApproveField,
  ApproveUserFieldValue,
} from "@/lib/approve/types"
import { isPredefined } from "@/lib/approve/field-categories"

import { submitSignature, type SignatureValue } from "../actions"

import { PdfCanvas } from "./pdf-canvas"
import { SigningField } from "./signing-field"

export function SigningView({
  document,
  fields,
  savedValues,
}: {
  document: ApproveDocument
  fields: ApproveField[]
  savedValues: ApproveUserFieldValue[]
}) {
  const [state, setState] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) {
      if (isPredefined(f.category)) {
        init[f.id] =
          savedValues.find((v) => v.category === f.category)?.value ?? ""
      } else {
        init[f.id] = ""
      }
    }
    return init
  })
  const [page, setPage] = useState(1)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!document.file_path) {
      setSignedUrl(null)
      return
    }
    const supabase = createClient()
    supabase.storage
      .from(APPROVE_BUCKET)
      .createSignedUrl(documentStoragePath(document.id), 60 * 30)
      .then(({ data }) => setSignedUrl(data?.signedUrl ?? null))
  }, [document.file_path, document.id])

  const totalFields = fields.length
  const filledCount = Object.values(state).filter((v) => v.trim()).length
  const fieldsOnPage = useMemo(
    () => fields.filter((f) => f.page === page),
    [fields, page]
  )

  const savedSignature =
    savedValues.find((v) => v.category === "signature")?.value ?? null

  async function onSubmit() {
    for (const f of fields) {
      if (!state[f.id]?.trim()) {
        toast.error("還有欄位沒填")
        return
      }
    }
    const values: SignatureValue[] = fields.map((f) => ({
      fieldId: f.id,
      value: state[f.id]!,
    }))
    try {
      await submitSignature(document.id, values)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">{document.title}</h1>
      <p className="text-xs text-muted-foreground">
        進度：{filledCount}/{totalFields}
      </p>

      {signedUrl && (
        <PdfCanvas fileUrl={signedUrl} page={page} onPageChange={setPage}>
          {(size) => (
            <>
              {fieldsOnPage.map((f) => (
                <SigningField
                  key={f.id}
                  field={f}
                  pageSize={size}
                  value={state[f.id] ?? ""}
                  savedSignature={savedSignature}
                  onChange={(v) => setState((s) => ({ ...s, [f.id]: v }))}
                />
              ))}
            </>
          )}
        </PdfCanvas>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={onSubmit}>
          送出簽核
        </Button>
      </div>
    </main>
  )
}
