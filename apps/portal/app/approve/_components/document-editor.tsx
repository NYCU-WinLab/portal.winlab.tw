"use client"

import { useState } from "react"

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
      <h1 className="text-2xl font-semibold">{initialTitle}</h1>
      {!filePath ? (
        <UploadZone documentId={documentId} onUploaded={setFilePath} />
      ) : (
        <p className="text-muted-foreground">
          PDF already uploaded: {filePath}
        </p>
      )}
    </main>
  )
}
