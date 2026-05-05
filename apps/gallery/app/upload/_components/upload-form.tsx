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
  const [fileNames, setFileNames] = useState<string[]>([])

  function inferArtworkName(fileName: string): string {
    const base = fileName.replace(/\.[^.]+$/, "").trim()
    return base || "Untitled"
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = formRef.current
    const fileInput = form?.querySelector<HTMLInputElement>("#gallery-file")
    const files = Array.from(fileInput?.files ?? [])
    const trimmed = name.trim()

    if (files.length === 0) {
      toast.error("Pick an image file.")
      return
    }
    if (files.some((file) => file.size === 0)) {
      toast.error("One of the selected files is empty.")
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { data: claimsData } = await supabase.auth.getClaims()
      const userId = claimsData?.claims?.sub
      if (!userId) {
        toast.error("Not signed in.")
        return
      }

      let successCount = 0
      const failed: string[] = []

      for (const file of files) {
        const resolvedMime = resolveImageMimeType(file)
        if (!resolvedMime) {
          failed.push(
            `${file.name} (unsupported type: ${file.type || "unknown"})`
          )
          continue
        }

        const ext = guessExtension(resolvedMime, file.name)
        if (ext === "bin") {
          failed.push(`${file.name} (unsupported extension)`)
          continue
        }

        const objectPath = `${userId}/${crypto.randomUUID()}.${ext}`
        const artworkName =
          files.length === 1 && trimmed ? trimmed : inferArtworkName(file.name)

        const { error: uploadError } = await supabase.storage
          .from("gallery")
          .upload(objectPath, file, {
            contentType: resolvedMime,
            upsert: false,
          })

        if (uploadError) {
          failed.push(`${file.name} (${uploadError.message})`)
          continue
        }

        const result = await registerGalleryImage(artworkName, objectPath)
        if (result.ok) {
          successCount += 1
        } else {
          await supabase.storage.from("gallery").remove([objectPath])
          failed.push(`${file.name} (${result.error})`)
        }
      }

      if (successCount > 0) {
        const suffix = successCount > 1 ? "s" : ""
        toast.success(`Uploaded ${successCount} work${suffix}.`)
        form?.reset()
        setName("")
        setFileNames([])
      }
      if (failed.length > 0) {
        const preview = failed.slice(0, 3).join("; ")
        const hidden = failed.length > 3 ? ` (+${failed.length - 3} more)` : ""
        toast.error(`Failed ${failed.length}: ${preview}${hidden}`)
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Label htmlFor="gallery-name" className="text-xl italic">
          Name (single upload only)
        </Label>
        <Input
          id="gallery-name"
          name="name"
          placeholder="Untitled, 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          className="h-12 rounded-none border-0 border-b border-border bg-transparent px-0 !text-lg focus-visible:border-foreground focus-visible:ring-0"
        />
      </div>
      <div className="flex flex-col gap-3">
        <Label htmlFor="gallery-file" className="text-xl italic">
          Images
        </Label>
        <Input
          id="gallery-file"
          name="file"
          type="file"
          accept="image/*"
          required
          multiple
          onChange={(e) =>
            setFileNames(Array.from(e.target.files ?? []).map((f) => f.name))
          }
          disabled={pending}
          className="h-12 rounded-none border-0 border-b border-border bg-transparent px-0 !text-lg file:mr-4 file:!text-base focus-visible:border-foreground focus-visible:ring-0"
        />
        {fileNames.length > 0 ? (
          <p className="text-base text-muted-foreground italic">
            {fileNames.length} selected: {fileNames.slice(0, 3).join(", ")}
            {fileNames.length > 3 ? ` (+${fileNames.length - 3} more)` : ""}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="mt-4 h-14 !text-lg italic"
      >
        {pending ? "Uploading…" : "Upload selected"}
      </Button>
    </form>
  )
}
