"use client"

import { useState } from "react"

import { SignerPicker } from "./signer-picker"
import { TitleInput } from "./title-input"
import { UploadZone } from "./upload-zone"

export function DocumentEditor({
  documentId,
  initialTitle,
  initialFilePath,
  initialSignerIds,
}: {
  documentId: string
  initialTitle: string
  initialFilePath: string | null
  initialSignerIds: string[]
}) {
  const [filePath, setFilePath] = useState(initialFilePath)
  const [signerIds, setSignerIds] = useState(initialSignerIds)

  return (
    <main className="space-y-4">
      <TitleInput documentId={documentId} initial={initialTitle} />
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Signers</div>
        <SignerPicker
          documentId={documentId}
          initialSignerIds={signerIds}
          onChange={setSignerIds}
        />
      </div>
      {!filePath ? (
        <UploadZone documentId={documentId} onUploaded={setFilePath} />
      ) : (
        <p className="text-sm text-muted-foreground">
          PDF: <code className="text-xs">{filePath}</code>
        </p>
      )}
    </main>
  )
}
