import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"
import { createClient } from "@/lib/supabase/server"

import { QueryProvider } from "./_components/query-provider"

export const metadata: Metadata = {
  title: "Admin | Portal",
  description: "Portal user and role management.",
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single()

  if (!profile?.is_admin) redirect("/")

  return (
    <QueryProvider>
      <PortalShell
        appName="Admin"
        appHref="/admin"
        bottomLeft={
          <Link href="/" className="transition-colors hover:text-foreground">
            Portal
          </Link>
        }
      >
        {children}
      </PortalShell>
      <Toaster />
    </QueryProvider>
  )
}
