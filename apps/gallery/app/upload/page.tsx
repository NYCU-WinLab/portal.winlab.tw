import { redirect } from "next/navigation"

import { SeasonalThemePanel } from "@/app/upload/_components/seasonal-theme-panel"
import { UploadForm } from "@/app/upload/_components/upload-form"
import { UploadManageList } from "@/app/upload/_components/upload-manage-list"
import {
  galleryPanelClass,
  gallerySectionLeadClass,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import { GalleryThemedShell } from "@/components/gallery-shell"
import type { ManageUploadRow } from "@/lib/gallery/manage-uploads"
import {
  getGallerySeasonalThemeId,
  isGallerySettingsReady,
} from "@/lib/gallery/settings"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import { cn } from "@workspace/ui/lib/utils"

export const dynamic = "force-dynamic"

export default async function UploadPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login?next=/upload")

  const supabase = await createClient()
  const [imagesResult, seasonalThemeId, settingsReady] = await Promise.all([
    supabase
      .from("gallery_images")
      .select(
        "id, name, image_path, media_type, poster_path, duration_seconds, created_by, created_at, sequence_id, sequence_index, pinned_at"
      )
      .eq("created_by", user.id)
      .order("created_at", { ascending: false }),
    getGallerySeasonalThemeId(supabase),
    isGallerySettingsReady(supabase),
  ])

  const myImages = (imagesResult.data ?? []).map((row) => ({
    ...(row as ManageUploadRow),
    pinned_at: (row as ManageUploadRow).pinned_at ?? null,
  }))

  return (
    <GalleryThemedShell active="manage" signedIn containerClassName="max-w-3xl">
      <div className="flex flex-col gap-10 sm:gap-12">
        <header>
          <h1 className={gallerySectionTitleClass()}>Manage</h1>
        </header>

        {user.isAdmin ? (
          <SeasonalThemePanel
            activeThemeId={seasonalThemeId}
            settingsReady={settingsReady}
          />
        ) : null}

        <section className={galleryPanelClass()}>
          <UploadForm />
        </section>

        <section className="space-y-4">
          <h2
            className={cn(gallerySectionTitleClass(), "text-2xl sm:text-3xl")}
          >
            Your uploads ({myImages.length})
          </h2>
          {myImages.length === 0 ? (
            <p className={gallerySectionLeadClass()}>
              You haven&apos;t uploaded anything yet.
            </p>
          ) : (
            <UploadManageList images={myImages} isAdmin={user.isAdmin} />
          )}
        </section>
      </div>
    </GalleryThemedShell>
  )
}
