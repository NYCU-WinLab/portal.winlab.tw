import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"
import { PortalShell } from "@/components/portal-shell"
import { SignOutButton } from "@/components/sign-out-button"
import { UserCard } from "@/components/user-card"
import {
  getEditableProfile,
  keycloakSubFromIdentities,
} from "@/lib/profile/keycloak"
import type { ProfileStats } from "@/lib/profile/stats"
import { createClient } from "@/lib/supabase/server"
import { getCurrentAuthUser, getCurrentUser } from "@/lib/user"

import { ProfileEditForm } from "./_components/profile-edit-form"
import { ProfileStatsView } from "./_components/profile-stats"

export default async function ProfilePage() {
  const user = (await getCurrentUser())!
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_profile_stats", {
    p_user_id: user.id,
  })
  if (error) throw error
  const stats = data as ProfileStats | null

  // Editable fields come from Keycloak, not Supabase. Hidden entirely when
  // the session has no Keycloak identity or the admin env isn't configured.
  const authUser = await getCurrentAuthUser()
  const sub = keycloakSubFromIdentities(authUser?.identities)
  const editable = sub ? await getEditableProfile(sub) : null

  return (
    <PortalShell
      appName="Profile"
      appHref="/profile"
      bottomLeft={
        <Link href="/" className="transition-colors hover:text-foreground">
          Portal
        </Link>
      }
    >
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">Profile</h1>
          <p className="text-sm text-muted-foreground">
            一些關於你的有趣數據。
          </p>
        </div>

        <UserCard
          name={user.name}
          email={user.email}
          avatarUrl={user.avatarUrl}
        />

        {editable ? <ProfileEditForm initial={editable} /> : null}

        {stats ? (
          <ProfileStatsView stats={stats} />
        ) : (
          <p className="text-sm text-muted-foreground italic">無法載入數據。</p>
        )}

        <div className="flex justify-end">
          <SignOutButton />
        </div>
      </div>
      <Toaster />
    </PortalShell>
  )
}
