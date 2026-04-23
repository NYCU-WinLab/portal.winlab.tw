"use client"

import { useEffect, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"
import type {
  ApproveDocument,
  ApproveField,
  ApproveSigner,
  SignerProfile,
} from "@/lib/approve/types"

import { PdfCanvas } from "./pdf-canvas"
import { SignerProgress } from "./signer-progress"
import { signerColor } from "./signer-badge"

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

  const visible =
    viewerRole === "creator"
      ? fields
      : fields.filter((f) => f.signer_id === viewerId)
  const onPage = visible.filter((f) => f.page === page)
  const nameBySigner = new Map(
    signers.map((s) => [s.signer_id, s.profile?.name ?? "?"])
  )

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">{document.title}</h1>
      <div className="flex gap-6">
        <div className="flex-1">
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
                          待 {nameBySigner.get(f.signer_id)} 簽
                        </span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </PdfCanvas>
          )}
        </div>
        <div className="w-56">
          <SignerProgress rows={signers} />
        </div>
      </div>
    </main>
  )
}
