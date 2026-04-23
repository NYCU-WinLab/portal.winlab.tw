"use client"

import { useState } from "react"

import { TitleInput } from "./title-input"
import { UploadZone } from "./upload-zone"

export function DocumentEditor({
  documentId,
  initialTitle,
  initialFilePath,
}: {
  documentId: string
  initialTitle: string
  initialFilePath: string | null
}) {
  const [filePath, setFilePath] = useState(initialFilePath)

  return (
    <main className="space-y-4">
      <TitleInput documentId={documentId} initial={initialTitle} />
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
