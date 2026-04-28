import Link from "next/link"

import { PortalShell } from "@/components/portal-shell"
import { SignOutButton } from "@/components/sign-out-button"
import { UserCard } from "@/components/user-card"
import type { ProfileStats } from "@/lib/profile/stats"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

import { ProfileStatsView } from "./_components/profile-stats"

export default async function ProfilePage() {
  const user = (await getCurrentUser())!
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_profile_stats", {
    p_user_id: user.id,
  })
  if (error) throw error
  const stats = data as ProfileStats | null

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

        {stats ? (
          <ProfileStatsView stats={stats} />
        ) : (
          <p className="text-sm text-muted-foreground italic">無法載入數據。</p>
        )}

        <div className="flex justify-end">
          <SignOutButton />
        </div>
      </div>
    </PortalShell>
  )
}
