"use client"

import type { FormEvent } from "react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { registerGalleryImage } from "@/app/upload/actions"
import { guessExtension, resolveImageMimeType } from "@/lib/gallery/mime"
import { createClient } from "@/lib/supabase/client"

/** Client uploads bytes to Supabase Storage; server action only registers the row (no 413 on Vercel). */
export function UploadForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = formRef.current
    const fileInput = form?.querySelector<HTMLInputElement>("#gallery-file")
    const file = fileInput?.files?.[0]
    const trimmed = name.trim()

    if (!trimmed) {
      toast.error("Name is required.")
      return
    }
    if (!file || file.size === 0) {
      toast.error("Pick an image file.")
      return
    }

    startTransition(async () => {
      const resolvedMime = resolveImageMimeType(file)
      if (!resolvedMime) {
        toast.error(
          `Unsupported file type: ${file.type || "unknown"}. Use JPEG, PNG, WebP, GIF, AVIF, or HEIC.`
        )
        return
      }

      const ext = guessExtension(resolvedMime, file.name)
      if (ext === "bin") {
        toast.error("Unsupported file type.")
        return
      }

      const supabase = createClient()
      const { data: claimsData } = await supabase.auth.getClaims()
      const userId = claimsData?.claims?.sub
      if (!userId) {
        toast.error("Not signed in.")
        return
      }

      const objectPath = `${userId}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("gallery")
        .upload(objectPath, file, {
          contentType: resolvedMime,
          upsert: false,
        })

      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`)
        return
      }

      const result = await registerGalleryImage(trimmed, objectPath)
      if (result.ok) {
        toast.success(`Uploaded "${trimmed}"`)
        form?.reset()
        setName("")
        setFileName(null)
      } else {
        await supabase.storage.from("gallery").remove([objectPath])
        toast.error(result.error)
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Label htmlFor="gallery-name" className="text-xl italic">
          Name
        </Label>
        <Input
          id="gallery-name"
          name="name"
          required
          placeholder="Untitled, 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          className="h-12 rounded-none border-0 border-b border-border bg-transparent px-0 !text-lg focus-visible:border-foreground focus-visible:ring-0"
        />
      </div>
      <div className="flex flex-col gap-3">
        <Label htmlFor="gallery-file" className="text-xl italic">
          Image
        </Label>
        <Input
          id="gallery-file"
          name="file"
          type="file"
          accept="image/*"
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          disabled={pending}
          className="h-12 rounded-none border-0 border-b border-border bg-transparent px-0 !text-lg file:mr-4 file:!text-base focus-visible:border-foreground focus-visible:ring-0"
        />
        {fileName ? (
          <p className="text-base text-muted-foreground italic">{fileName}</p>
        ) : null}
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="mt-4 h-14 !text-lg italic"
      >
        {pending ? "Uploading…" : "Upload"}
      </Button>
    </form>
  )
}
