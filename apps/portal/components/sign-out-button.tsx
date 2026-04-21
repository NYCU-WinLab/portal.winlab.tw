"use client"

import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"

export function SignOutButton() {
  const router = useRouter()

  async function onClick() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace("/auth/login")
    router.refresh()
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      Sign out
    </Button>
  )
}
