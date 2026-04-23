"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { IconDownload } from "@tabler/icons-react"

import { createClient } from "@/lib/supabase/client"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"
import type {
  ApproveDocument,
  ApproveField,
  ApproveSigner,
  SignerProfile,
} from "@/lib/approve/types"

import { SignerProgress } from "./signer-progress"
import { signerColor } from "./signer-badge"

const PdfCanvas = dynamic(
  () => import("./pdf-canvas").then((m) => ({ default: m.PdfCanvas })),
  {
    ssr: false,
    loading: () => <p className="text-muted-foreground">載入 PDF...</p>,
  }
)

export function DocumentView({
  document,
  signers,
  fields,
  viewerRole,
  viewerId,
}: {
  document: ApproveDocument
  signers: (ApproveSigner & { profile: SignerProfile | null })[]
  fields: ApproveField[]
  viewerRole: "creator" | "signer"
  viewerId: string
}) {
  const [page, setPage] = useState(1)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!document.file_path) {
      setSignedUrl(null)
      return
    }
    const supabase = createClient()
    supabase.storage
      .from(APPROVE_BUCKET)
      .createSignedUrl(documentStoragePath(document.id), 60 * 30)
      .then(({ data, error }) => {
        if (error) {
          console.error("[approve] createSignedUrl failed", error)
          toast.error(error.message)
          return
        }
        setSignedUrl(data?.signedUrl ?? null)
      })
  }, [document.file_path, document.id])

  async function onDownload() {
    if (!signedUrl) return
    setDownloading(true)
    try {
      const { buildSignedPdf, downloadPdf } =
        await import("@/lib/approve/pdf-merge")
      const bytes = await buildSignedPdf(signedUrl, fields)
      downloadPdf(bytes, `${document.title || "approve"}.pdf`)
    } catch (e) {
      console.error("[approve] download pdf failed", e)
      toast.error((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  const visible =
    viewerRole === "creator"
      ? fields
      : fields.filter((f) => f.signer_id === viewerId)
  const onPage = visible.filter((f) => f.page === page)
  const nameBySigner = new Map(
    signers.map((s) => [s.signer_id, s.profile?.name ?? "?"])
  )

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <h1 className="font-medium">{document.title}</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={onDownload}
          disabled={!signedUrl || downloading}
        >
          <IconDownload className="size-4" />
          {downloading ? "產生中..." : "下載 PDF"}
        </Button>
      </div>
      <SignerProgress rows={signers} />
      {signedUrl && (
        <PdfCanvas fileUrl={signedUrl} page={page} onPageChange={setPage}>
          {(size) => (
            <>
              {onPage.map((f) => (
                <div
                  key={f.id}
                  className="absolute rounded border bg-background/70"
                  style={{
                    left: f.x * size.width,
                    top: f.y * size.height,
                    width: f.width * size.width,
                    height: f.height * size.height,
                    borderColor: signerColor(f.signer_id),
                  }}
                >
                  {f.value ? (
                    f.category === "signature" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.value}
                        alt="signature"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="block px-1 text-xs">{f.value}</span>
                    )
                  ) : (
                    <span className="block px-1 text-[10px] text-muted-foreground">
                      待 {f.signer_id ? nameBySigner.get(f.signer_id) : "?"} 簽
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </PdfCanvas>
      )}
    </div>
  )
}
