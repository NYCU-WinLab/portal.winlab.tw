"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { IconSearch, IconX } from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"

export function GalleryAlbumsSearch({
  initialQuery,
  mineOnly,
}: {
  initialQuery: string
  mineOnly: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(initialQuery)
  const [pending, startTransition] = useTransition()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const params = new URLSearchParams()
    if (mineOnly) params.set("mine", "1")
    const q = draft.trim()
    if (q) params.set("q", q)
    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `/albums?${qs}` : "/albums", { scroll: false })
    })
  }

  const clear = () => {
    setDraft("")
    const params = new URLSearchParams()
    if (mineOnly) params.set("mine", "1")
    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `/albums?${qs}` : "/albums", { scroll: false })
    })
  }

  return (
    <form
      onSubmit={submit}
      className="flex w-full max-w-md items-center gap-2"
      role="search"
      aria-label="Search albums"
    >
      <div className="relative min-w-0 flex-1">
        <IconSearch
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search title, slug, owner…"
          className={cn(
            gallerySans(),
            "min-h-10 w-full rounded-md border border-input bg-background py-2 pr-9 pl-9 text-sm shadow-xs outline-none",
            "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          )}
        />
        {draft ? (
          <button
            type="button"
            aria-label="Clear album search"
            className="absolute top-1/2 right-2.5 inline-flex size-7 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={clear}
          >
            <IconX className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className={cn(
          gallerySans(),
          "inline-flex h-10 shrink-0 items-center rounded-md border border-input bg-background px-3 text-sm shadow-xs",
          "hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        )}
      >
        Search
      </button>
    </form>
  )
}
