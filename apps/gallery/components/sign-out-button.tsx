"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"

export function SignOutButton() {
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
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={pending}
      className="h-auto p-0 text-lg font-normal hover:bg-transparent"
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  )
}
