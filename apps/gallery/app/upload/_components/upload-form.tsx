"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { uploadGalleryImage } from "@/app/upload/actions"

export function UploadForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)

  async function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await uploadGalleryImage(formData)
      if (result.ok) {
        toast.success(`Uploaded "${name}"`)
        formRef.current?.reset()
        setName("")
        setFileName(null)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form ref={formRef} action={onSubmit} className="flex flex-col gap-8">
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
