"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { createClient } from "@/lib/supabase/client"

export function SignOutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onClick() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.replace("/")
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        className,
        "disabled:pointer-events-none disabled:opacity-50"
      )}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  )
}
