"use client"

import { useEffect, useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { IconSearch, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

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

  useEffect(() => {
    setDraft(initialQuery)
  }, [initialQuery])

  const navigate = (nextDraft: string) => {
    const params = new URLSearchParams()
    if (mineOnly) params.set("mine", "1")
    const q = nextDraft.trim()
    if (q) params.set("q", q)
    const qs = params.toString()
    startTransition(() => {
      try {
        router.replace(qs ? `/albums?${qs}` : "/albums", { scroll: false })
      } catch {
        toast.error("Could not update album search.")
      }
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    navigate(draft)
  }

  const clear = () => {
    setDraft("")
    navigate("")
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const hasQuery = Boolean(draft.trim() || initialQuery.trim())
      if (!hasQuery) return
      event.preventDefault()
      setDraft("")
      navigate("")
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [draft, initialQuery, mineOnly, router])

  return (
    <form
      onSubmit={submit}
      className="flex w-full max-w-md items-center gap-2"
      role="search"
      aria-label="Search albums"
      aria-busy={pending || undefined}
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
          aria-label="Search albums by title, slug, or owner"
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
        aria-busy={pending || undefined}
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
