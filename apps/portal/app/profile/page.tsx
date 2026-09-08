import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"
import { PortalShell } from "@/components/portal-shell"
import { SignOutButton } from "@/components/sign-out-button"
import { UserCard } from "@/components/user-card"
import { accountConsoleUrl } from "@/lib/keycloak/admin"
import type { ProfileFieldsResult } from "@/lib/profile/keycloak"
import {
  getProfileFields,
  keycloakSubFromIdentities,
} from "@/lib/profile/keycloak"
import type { ProfileStats } from "@/lib/profile/stats"
import { createClient } from "@/lib/supabase/server"
import { getCurrentAuthUser, getCurrentUser } from "@/lib/user"

import { ProfileAccount } from "./_components/profile-account"
import { ProfileStatsView } from "./_components/profile-stats"
import { Section } from "./_components/profile-ui"

export default async function ProfilePage() {
  const user = (await getCurrentUser())!
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_profile_stats", {
    p_user_id: user.id,
  })
  if (error) throw error
  const stats = data as ProfileStats | null

  // Account fields come from Keycloak, not Supabase, and are read-only here —
  // the link at the bottom of the section is where they get changed. Hidden
  // entirely when the session has no Keycloak identity or Keycloak isn't
  // configured; shown as a notice when it's configured but unreachable, so an
  // IdP outage costs this section and nothing else on the page.
  const authUser = await getCurrentAuthUser()
  const sub = keycloakSubFromIdentities(authUser?.identities)
  const account: ProfileFieldsResult = sub
    ? await getProfileFields(sub)
    : { status: "unconfigured" }

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

        {account.status === "ok" ? (
          <ProfileAccount
            profile={account.profile}
            accountUrl={accountConsoleUrl()}
          />
        ) : null}
        {account.status === "unavailable" ? (
          <Section title="基本資料">
            <p className="px-4 py-3 text-xs text-muted-foreground">
              目前無法讀取 Keycloak 帳號資料。稍後再試一次。
            </p>
          </Section>
        ) : null}

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
