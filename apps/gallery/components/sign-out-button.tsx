"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { IconLogout } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { createClient } from "@/lib/supabase/client"
import { describeSigningOutLabel } from "@/lib/gallery/busy-labels"
import { describeGalleryNavError } from "@/lib/gallery/gallery-nav-errors"
import { describeCouldNotSignOut } from "@/lib/gallery/validation-toasts"

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
    if (pending) return
    startTransition(async () => {
      try {
        const supabase = createClient()
        const { error } = await supabase.auth.signOut()
        if (error) {
          toast.error(error.message || describeCouldNotSignOut())
          return
        }
        try {
          router.replace("/")
        } catch {
          toast.error(describeGalleryNavError("signedOutHome"))
        }
        try {
          router.refresh()
        } catch {
          // Best-effort after a successful sign-out.
        }
      } catch {
        toast.error(describeCouldNotSignOut())
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
      aria-label={iconOnly ? "Sign out" : undefined}
      className={cn(
        className,
        "disabled:pointer-events-none disabled:opacity-50"
      )}
    >
      {iconOnly ? (
        <IconLogout className="size-4" aria-hidden />
      ) : pending ? (
        describeSigningOutLabel()
      ) : (
        "Sign out"
      )}
    </button>
  )
}
