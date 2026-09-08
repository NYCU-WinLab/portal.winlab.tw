import { redirect } from "next/navigation"

import { MediaHealthPanel } from "@/app/upload/_components/media-health-panel"
import { SeasonalThemePanel } from "@/app/upload/_components/seasonal-theme-panel"
import { TagAdminPanel } from "@/app/upload/_components/tag-admin-panel"
import { UploadForm } from "@/app/upload/_components/upload-form"
import { UploadManageList } from "@/app/upload/_components/upload-manage-list"
import { GalleryPageHero } from "@/app/_components/gallery-page-hero"
import {
  galleryPanelClass,
  gallerySans,
  gallerySectionLeadClass,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import { GalleryThemedShell } from "@/components/gallery-shell"
import { isGalleryAlbumsReady } from "@/lib/gallery/albums"
import { isGalleryFavoritesReady } from "@/lib/gallery/favorites"
import { loadManageUploadsWithCascade } from "@/lib/gallery/manage-select-cascade"
import {
  getGallerySeasonalThemeId,
  isGallerySettingsReady,
} from "@/lib/gallery/settings"
import { isGalleryTagsReady } from "@/lib/gallery/tags"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import { cn } from "@workspace/ui/lib/utils"

export const dynamic = "force-dynamic"

export default async function UploadPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login?next=/upload")

  const supabase = await createClient()
  const [
    manageLoad,
    seasonalThemeId,
    settingsReady,
    favoritesReady,
    tagsReady,
    albumsReady,
  ] = await Promise.all([
    loadManageUploadsWithCascade(async (select) => {
      const result = await supabase
        .from("gallery_images")
        .select(select)
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
      return { data: result.data, error: result.error }
    }),
    getGallerySeasonalThemeId(supabase),
    isGallerySettingsReady(supabase),
    isGalleryFavoritesReady(supabase),
    isGalleryTagsReady(supabase),
    isGalleryAlbumsReady(supabase),
  ])

  const {
    rows: imageRows,
    videoAvailable,
    sequenceAvailable,
    pinAvailable,
    takenAtAvailable,
  } = manageLoad

  const myImages = (imageRows ?? []).map((row) => ({
    ...row,
    sequence_id: sequenceAvailable ? (row.sequence_id ?? null) : null,
    sequence_index: sequenceAvailable ? (row.sequence_index ?? null) : null,
    media_type: videoAvailable ? (row.media_type ?? "image") : "image",
    poster_path: videoAvailable ? (row.poster_path ?? null) : null,
    duration_seconds: videoAvailable ? (row.duration_seconds ?? null) : null,
    pinned_at: pinAvailable ? (row.pinned_at ?? null) : null,
    taken_at: takenAtAvailable ? (row.taken_at ?? null) : null,
  }))

  return (
    <GalleryThemedShell active="manage" signedIn containerClassName="max-w-3xl">
      <div className="flex flex-col gap-10 sm:gap-12">
        <GalleryPageHero
          title="Manage"
          lead="Develop shots in the darkroom tray, then pin them to the lab paper wall — sequences, covers, and the occasional axolotl cameo."
        />

        {user.isAdmin ? (
          <>
            <SeasonalThemePanel
              activeThemeId={seasonalThemeId}
              settingsReady={settingsReady}
            />
            {tagsReady ? <TagAdminPanel /> : null}
            <MediaHealthPanel />
          </>
        ) : null}

        <section className={cn(galleryPanelClass(), "overflow-hidden !p-0")}>
          <div className="p-5 sm:p-7">
            <UploadForm
              videoAvailable={videoAvailable}
              sequencesAvailable={sequenceAvailable}
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <p
              className={cn(
                gallerySans(),
                "text-[10px] tracking-[0.22em] text-muted-foreground uppercase"
              )}
            >
              Your darkroom
            </p>
            <h2
              className={cn(gallerySectionTitleClass(), "text-2xl sm:text-3xl")}
            >
              On the wall ({myImages.length})
            </h2>
          </div>
          {myImages.length === 0 ? (
            <p className={gallerySectionLeadClass()}>
              Nothing hung yet — drop a photo above to claim a spot on the wall.
            </p>
          ) : (
            <UploadManageList
              images={myImages}
              isAdmin={user.isAdmin}
              takenAtAvailable={takenAtAvailable}
              favoritesAvailable={favoritesReady}
              tagsAvailable={tagsReady}
              albumsAvailable={albumsReady}
              pinAvailable={pinAvailable}
              sequencesAvailable={sequenceAvailable}
            />
          )}
        </section>
      </div>
    </GalleryThemedShell>
  )
}
