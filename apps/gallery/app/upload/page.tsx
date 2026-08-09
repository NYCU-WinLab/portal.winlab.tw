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
import type { ManageUploadRow } from "@/lib/gallery/manage-uploads"
import {
  isGalleryPinnedAtUnavailable,
  isGallerySequenceUnavailable,
  isGalleryTakenAtUnavailable,
  isGalleryVideoColumnsUnavailable,
} from "@/lib/gallery/manage-uploads"
import { isGalleryAlbumsReady } from "@/lib/gallery/albums"
import { isGalleryFavoritesReady } from "@/lib/gallery/favorites"
import { isGalleryTagsReady } from "@/lib/gallery/tags"
import {
  getGallerySeasonalThemeId,
  isGallerySettingsReady,
} from "@/lib/gallery/settings"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import { cn } from "@workspace/ui/lib/utils"

export const dynamic = "force-dynamic"

const MANAGE_SELECT_MINIMAL = "id, name, image_path, created_by, created_at"
const MANAGE_SELECT_BARE = `${MANAGE_SELECT_MINIMAL}, media_type, poster_path, duration_seconds`
const MANAGE_SELECT_CORE = `${MANAGE_SELECT_BARE}, sequence_id, sequence_index`
const MANAGE_SELECT_WITH_PIN = `${MANAGE_SELECT_CORE}, pinned_at`
const MANAGE_SELECT_FULL = `${MANAGE_SELECT_WITH_PIN}, taken_at`

export default async function UploadPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login?next=/upload")

  const supabase = await createClient()
  const [
    imagesFull,
    seasonalThemeId,
    settingsReady,
    favoritesReady,
    tagsReady,
    albumsReady,
  ] = await Promise.all([
    supabase
      .from("gallery_images")
      .select(MANAGE_SELECT_FULL)
      .eq("created_by", user.id)
      .order("created_at", { ascending: false }),
    getGallerySeasonalThemeId(supabase),
    isGallerySettingsReady(supabase),
    isGalleryFavoritesReady(supabase),
    isGalleryTagsReady(supabase),
    isGalleryAlbumsReady(supabase),
  ])

  let imageRows: ManageUploadRow[] | null = asManageRows(imagesFull.data)
  let takenAtAvailable = true
  let pinAvailable = true
  let sequenceAvailable = true
  let videoAvailable = true

  function asManageRows(data: unknown): ManageUploadRow[] | null {
    return (data as ManageUploadRow[] | null) ?? null
  }

  async function loadManageSelect(select: string) {
    return supabase
      .from("gallery_images")
      .select(select)
      .eq("created_by", user!.id)
      .order("created_at", { ascending: false })
  }

  if (imagesFull.error) {
    if (isGalleryVideoColumnsUnavailable(imagesFull.error)) {
      videoAvailable = false
      const noVideoFull = await loadManageSelect(
        `${MANAGE_SELECT_MINIMAL}, sequence_id, sequence_index, pinned_at, taken_at`
      )
      if (
        noVideoFull.error &&
        isGallerySequenceUnavailable(noVideoFull.error)
      ) {
        sequenceAvailable = false
        const noVideoNoSeq = await loadManageSelect(
          `${MANAGE_SELECT_MINIMAL}, pinned_at, taken_at`
        )
        if (
          noVideoNoSeq.error &&
          isGalleryTakenAtUnavailable(noVideoNoSeq.error)
        ) {
          takenAtAvailable = false
          const pinOnly = await loadManageSelect(
            `${MANAGE_SELECT_MINIMAL}, pinned_at`
          )
          if (pinOnly.error && isGalleryPinnedAtUnavailable(pinOnly.error)) {
            pinAvailable = false
            const minimal = await loadManageSelect(MANAGE_SELECT_MINIMAL)
            imageRows = asManageRows(minimal.data)
          } else if (pinOnly.error) {
            imageRows = null
          } else {
            imageRows = asManageRows(pinOnly.data)
          }
        } else if (
          noVideoNoSeq.error &&
          isGalleryPinnedAtUnavailable(noVideoNoSeq.error)
        ) {
          pinAvailable = false
          const takenOnly = await loadManageSelect(
            `${MANAGE_SELECT_MINIMAL}, taken_at`
          )
          if (takenOnly.error && isGalleryTakenAtUnavailable(takenOnly.error)) {
            takenAtAvailable = false
            const minimal = await loadManageSelect(MANAGE_SELECT_MINIMAL)
            imageRows = asManageRows(minimal.data)
          } else if (takenOnly.error) {
            imageRows = null
          } else {
            imageRows = asManageRows(takenOnly.data)
          }
        } else if (noVideoNoSeq.error) {
          imageRows = null
        } else {
          imageRows = asManageRows(noVideoNoSeq.data)
        }
      } else if (
        noVideoFull.error &&
        isGalleryTakenAtUnavailable(noVideoFull.error)
      ) {
        takenAtAvailable = false
        const withPin = await loadManageSelect(
          `${MANAGE_SELECT_MINIMAL}, sequence_id, sequence_index, pinned_at`
        )
        if (withPin.error && isGallerySequenceUnavailable(withPin.error)) {
          sequenceAvailable = false
          const pinOnly = await loadManageSelect(
            `${MANAGE_SELECT_MINIMAL}, pinned_at`
          )
          if (pinOnly.error && isGalleryPinnedAtUnavailable(pinOnly.error)) {
            pinAvailable = false
            const minimal = await loadManageSelect(MANAGE_SELECT_MINIMAL)
            imageRows = asManageRows(minimal.data)
          } else if (pinOnly.error) {
            imageRows = null
          } else {
            imageRows = asManageRows(pinOnly.data)
          }
        } else if (
          withPin.error &&
          isGalleryPinnedAtUnavailable(withPin.error)
        ) {
          pinAvailable = false
          const core = await loadManageSelect(
            `${MANAGE_SELECT_MINIMAL}, sequence_id, sequence_index`
          )
          if (core.error && isGallerySequenceUnavailable(core.error)) {
            sequenceAvailable = false
            const minimal = await loadManageSelect(MANAGE_SELECT_MINIMAL)
            imageRows = asManageRows(minimal.data)
          } else if (core.error) {
            imageRows = null
          } else {
            imageRows = asManageRows(core.data)
          }
        } else if (withPin.error) {
          imageRows = null
        } else {
          imageRows = asManageRows(withPin.data)
        }
      } else if (
        noVideoFull.error &&
        isGalleryPinnedAtUnavailable(noVideoFull.error)
      ) {
        pinAvailable = false
        const withTaken = await loadManageSelect(
          `${MANAGE_SELECT_MINIMAL}, sequence_id, sequence_index, taken_at`
        )
        if (withTaken.error && isGallerySequenceUnavailable(withTaken.error)) {
          sequenceAvailable = false
          const takenOnly = await loadManageSelect(
            `${MANAGE_SELECT_MINIMAL}, taken_at`
          )
          if (takenOnly.error && isGalleryTakenAtUnavailable(takenOnly.error)) {
            takenAtAvailable = false
            const minimal = await loadManageSelect(MANAGE_SELECT_MINIMAL)
            imageRows = asManageRows(minimal.data)
          } else if (takenOnly.error) {
            imageRows = null
          } else {
            imageRows = asManageRows(takenOnly.data)
          }
        } else if (
          withTaken.error &&
          isGalleryTakenAtUnavailable(withTaken.error)
        ) {
          takenAtAvailable = false
          const core = await loadManageSelect(
            `${MANAGE_SELECT_MINIMAL}, sequence_id, sequence_index`
          )
          if (core.error && isGallerySequenceUnavailable(core.error)) {
            sequenceAvailable = false
            const minimal = await loadManageSelect(MANAGE_SELECT_MINIMAL)
            imageRows = asManageRows(minimal.data)
          } else if (core.error) {
            imageRows = null
          } else {
            imageRows = asManageRows(core.data)
          }
        } else if (withTaken.error) {
          imageRows = null
        } else {
          imageRows = asManageRows(withTaken.data)
        }
      } else if (noVideoFull.error) {
        imageRows = null
      } else {
        imageRows = asManageRows(noVideoFull.data)
      }
    } else if (isGallerySequenceUnavailable(imagesFull.error)) {
      sequenceAvailable = false
      const bareFull = await loadManageSelect(
        `${MANAGE_SELECT_BARE}, pinned_at, taken_at`
      )
      if (bareFull.error && isGalleryTakenAtUnavailable(bareFull.error)) {
        takenAtAvailable = false
        const barePin = await loadManageSelect(
          `${MANAGE_SELECT_BARE}, pinned_at`
        )
        if (barePin.error && isGalleryPinnedAtUnavailable(barePin.error)) {
          pinAvailable = false
          const bare = await loadManageSelect(MANAGE_SELECT_BARE)
          imageRows = asManageRows(bare.data)
        } else if (barePin.error) {
          imageRows = null
        } else {
          imageRows = asManageRows(barePin.data)
        }
      } else if (
        bareFull.error &&
        isGalleryPinnedAtUnavailable(bareFull.error)
      ) {
        pinAvailable = false
        const bareTaken = await loadManageSelect(
          `${MANAGE_SELECT_BARE}, taken_at`
        )
        if (bareTaken.error && isGalleryTakenAtUnavailable(bareTaken.error)) {
          takenAtAvailable = false
          const bare = await loadManageSelect(MANAGE_SELECT_BARE)
          imageRows = asManageRows(bare.data)
        } else if (bareTaken.error) {
          imageRows = null
        } else {
          imageRows = asManageRows(bareTaken.data)
        }
      } else if (bareFull.error) {
        imageRows = null
      } else {
        imageRows = asManageRows(bareFull.data)
      }
    } else if (isGalleryTakenAtUnavailable(imagesFull.error)) {
      takenAtAvailable = false
      const withPin = await loadManageSelect(MANAGE_SELECT_WITH_PIN)

      if (withPin.error && isGallerySequenceUnavailable(withPin.error)) {
        sequenceAvailable = false
        const barePin = await loadManageSelect(
          `${MANAGE_SELECT_BARE}, pinned_at`
        )
        if (barePin.error && isGalleryPinnedAtUnavailable(barePin.error)) {
          pinAvailable = false
          const bare = await loadManageSelect(MANAGE_SELECT_BARE)
          imageRows = asManageRows(bare.data)
        } else if (barePin.error) {
          imageRows = null
        } else {
          imageRows = asManageRows(barePin.data)
        }
      } else if (withPin.error && isGalleryPinnedAtUnavailable(withPin.error)) {
        pinAvailable = false
        const core = await loadManageSelect(MANAGE_SELECT_CORE)
        if (core.error && isGallerySequenceUnavailable(core.error)) {
          sequenceAvailable = false
          const bare = await loadManageSelect(MANAGE_SELECT_BARE)
          imageRows = asManageRows(bare.data)
        } else if (core.error) {
          imageRows = null
        } else {
          imageRows = asManageRows(core.data)
        }
      } else if (withPin.error) {
        imageRows = null
      } else {
        imageRows = asManageRows(withPin.data)
      }
    } else if (isGalleryPinnedAtUnavailable(imagesFull.error)) {
      pinAvailable = false
      const withTaken = await loadManageSelect(
        `${MANAGE_SELECT_CORE}, taken_at`
      )

      if (withTaken.error && isGallerySequenceUnavailable(withTaken.error)) {
        sequenceAvailable = false
        const bareTaken = await loadManageSelect(
          `${MANAGE_SELECT_BARE}, taken_at`
        )
        if (bareTaken.error && isGalleryTakenAtUnavailable(bareTaken.error)) {
          takenAtAvailable = false
          const bare = await loadManageSelect(MANAGE_SELECT_BARE)
          imageRows = asManageRows(bare.data)
        } else if (bareTaken.error) {
          imageRows = null
        } else {
          imageRows = asManageRows(bareTaken.data)
        }
      } else if (
        withTaken.error &&
        isGalleryTakenAtUnavailable(withTaken.error)
      ) {
        takenAtAvailable = false
        const core = await loadManageSelect(MANAGE_SELECT_CORE)
        if (core.error && isGallerySequenceUnavailable(core.error)) {
          sequenceAvailable = false
          const bare = await loadManageSelect(MANAGE_SELECT_BARE)
          imageRows = asManageRows(bare.data)
        } else if (core.error) {
          imageRows = null
        } else {
          imageRows = asManageRows(core.data)
        }
      } else if (withTaken.error) {
        imageRows = null
      } else {
        imageRows = asManageRows(withTaken.data)
      }
    } else {
      imageRows = null
    }
  }

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
          lead="Develop shots in the darkroom tray, then pin them to the lab paper wall ??sequences, covers, and the occasional axolotl cameo."
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
            <UploadForm videoAvailable={videoAvailable} />
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
              Nothing hung yet ??drop a photo above to claim a spot on the wall.
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
            />
          )}
        </section>
      </div>
    </GalleryThemedShell>
  )
}
