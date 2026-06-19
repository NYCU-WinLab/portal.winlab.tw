"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { IconLogout } from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

import { createClient } from "@/lib/supabase/client"

export function SignOutButton({
  className,
  iconOnly = false,
}: {
  className?: string
  iconOnly?: boolean
}) {
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
      aria-label={iconOnly ? "Sign out" : undefined}
      className={cn(
        className,
        "disabled:pointer-events-none disabled:opacity-50"
      )}
    >
      {iconOnly ? (
        <IconLogout className="size-4" aria-hidden />
      ) : pending ? (
        "Signing out…"
      ) : (
        "Sign out"
      )}
    </button>
  )
}
