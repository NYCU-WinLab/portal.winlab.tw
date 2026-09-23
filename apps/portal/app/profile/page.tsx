import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"
import { PortalShell } from "@/components/portal-shell"
import { SignOutButton } from "@/components/sign-out-button"
import { UserCard } from "@/components/user-card"
import { normalizeGreetingName } from "@/lib/door/greetings"
import { accountConsoleUrl } from "@/lib/keycloak/admin"
import {
  fetchDoorGreeting,
  type DoorGreeting,
} from "@/lib/profile/door-greeting"
import {
  fetchDoorSound,
  signOwnDoorSound,
  type DoorSound,
} from "@/lib/profile/door-sound"
import { fetchProfileStats } from "@/lib/profile/fetch"
import type { ProfileFieldsResult } from "@/lib/profile/keycloak"
import {
  getProfileFields,
  keycloakSubFromIdentities,
} from "@/lib/profile/keycloak"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getCurrentAuthUser, getCurrentUser } from "@/lib/user"

import { DoorGreetingForm } from "./_components/door-greeting"
import { DoorSoundForm } from "./_components/door-sound"
import { ProfileAccount } from "./_components/profile-account"
import { ProfileStatsView } from "./_components/profile-stats"
import { Section } from "./_components/profile-ui"

export default async function ProfilePage() {
  const user = (await getCurrentUser())!
  const supabase = await createClient()
  const stats = await fetchProfileStats(supabase, user.id)
  // The panel greets a /door press with user_profiles.name, so the preview
  // does too. A failed read hides this section and nothing else.
  const greeting: DoorGreeting | null = await fetchDoorGreeting(
    supabase,
    user.id
  ).catch((err: unknown) => {
    console.error("[profile] door greeting read failed", err)
    return null
  })
  // Same deal for the door sound. The bucket is readable only by the service
  // role, so the player gets a URL signed here for the member's own file.
  const sound: DoorSound | null = await fetchDoorSound(supabase, user.id).catch(
    (err: unknown) => {
      console.error("[profile] door sound read failed", err)
      return null
    }
  )
  const soundUrl = sound?.path
    ? await signOwnDoorSound(createAdminClient(), user.id, sound.path)
    : null

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

        {greeting ? (
          <DoorGreetingForm
            name={normalizeGreetingName(greeting.name?.trim() || user.name)}
            suffix={greeting.suffix}
            color={greeting.color}
          />
        ) : null}

        {sound ? (
          <DoorSoundForm
            userId={user.id}
            path={sound.path}
            mode={sound.mode}
            url={soundUrl}
            suffix={greeting?.suffix ?? null}
          />
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
