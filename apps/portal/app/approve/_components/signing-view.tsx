"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import type {
  ApproveDocument,
  ApproveField,
  ApproveUserFieldValue,
} from "@/lib/approve/types"
import { isPredefined } from "@/lib/approve/field-categories"
import { useApprovePdfUrl } from "@/hooks/approve/use-approve-pdf-url"

import { submitSignature, type SignatureValue } from "../actions"

import { SigningField } from "./signing-field"

const PdfCanvas = dynamic(
  () => import("./pdf-canvas").then((m) => ({ default: m.PdfCanvas })),
  {
    ssr: false,
    loading: () => <p className="text-muted-foreground">載入 PDF...</p>,
  }
)

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
  const { url: signedUrl, refresh: refreshSignedUrl } = useApprovePdfUrl(
    document.id,
    document.file_path
  )

  const totalFields = fields.length
  const filledCount = Object.values(state).filter((v) => v.trim()).length
  const fieldsOnPage = useMemo(
    () => fields.filter((f) => f.page === page),
    [fields, page]
  )

  const router = useRouter()
  const queryClient = useQueryClient()
  const [submitPending, startSubmit] = useTransition()

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
      await queryClient.invalidateQueries({ queryKey: ["approve"] })
      router.push("/approve")
    } catch (e) {
      console.error("[approve] submitSignature failed", e)
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">{document.title}</h1>
          <p className="text-sm text-muted-foreground">
            進度 {filledCount}/{totalFields}
          </p>
        </div>
        <Button
          size="sm"
          type="button"
          onClick={() => startSubmit(onSubmit)}
          disabled={submitPending}
        >
          {submitPending ? "送出中..." : "送出簽核"}
        </Button>
      </div>

      {signedUrl && (
        <PdfCanvas
          fileUrl={signedUrl}
          page={page}
          onPageChange={setPage}
          onLoadError={refreshSignedUrl}
        >
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
    </div>
  )
}
