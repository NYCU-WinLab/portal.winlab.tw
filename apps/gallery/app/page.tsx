import Link from "next/link"

import { PortalShell } from "@workspace/ui/components/portal-shell"

import { GalleryGrid } from "@/app/_components/gallery-grid"
import { SignOutButton } from "@/components/sign-out-button"
import {
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
  aggregateReactions,
  isGalleryReaction,
} from "@/lib/gallery/reactions"
import type { GalleryImage } from "@/lib/gallery/types"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

export const dynamic = "force-dynamic"

export default async function GalleryHomePage() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from("gallery_images")
    .select(
      "id, name, image_path, media_type, poster_path, duration_seconds, created_by, created_at"
    )
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[gallery] failed to load images", error)
  }

  const baseImages = data ?? []
  const imageIds = baseImages.map((image) => image.id)
  const creatorIds = Array.from(
    new Set(baseImages.map((image) => image.created_by).filter(Boolean))
  ) as string[]

  let uploaderNameById = new Map<string, string>()
  if (creatorIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, name, email")
      .in("id", creatorIds)

    if (profileError) {
      console.error("[gallery] failed to load uploader profiles", profileError)
    } else {
      uploaderNameById = (profileRows ?? []).reduce((map, row) => {
        const fallback =
          typeof row.email === "string" ? row.email.split("@")[0] : null
        const name =
          (typeof row.name === "string" && row.name.trim()) ||
          fallback ||
          "Unknown"
        map.set(row.id, name)
        return map
      }, new Map<string, string>())
    }
  }

  let countsByImage = new Map<string, typeof EMPTY_REACTION_COUNTS>()
  let namesByImage = new Map<string, typeof EMPTY_REACTION_NAMES>()
  let myReactionByImage = new Map<string, GalleryImage["my_reaction"]>()

  if (imageIds.length > 0) {
    const { data: voteRows, error: voteError } = await supabase
      .from("gallery_image_votes")
      .select("image_id, user_id, reaction")
      .in("image_id", imageIds)

    if (voteError) {
      console.error("[gallery] failed to load reactions", voteError)
    } else {
      const voterIds = Array.from(
        new Set((voteRows ?? []).map((row) => row.user_id).filter(Boolean))
      )
      let voterNameById = new Map<string, string>()

      if (voterIds.length > 0) {
        const { data: voterProfiles, error: voterProfilesError } =
          await supabase
            .from("user_profiles")
            .select("id, name, email")
            .in("id", voterIds)

        if (voterProfilesError) {
          console.error(
            "[gallery] failed to load reactor profiles",
            voterProfilesError
          )
        } else {
          voterNameById = (voterProfiles ?? []).reduce((map, row) => {
            const fallback =
              typeof row.email === "string" ? row.email.split("@")[0] : null
            const name =
              (typeof row.name === "string" && row.name.trim()) ||
              fallback ||
              "Unknown"
            map.set(row.id, name)
            return map
          }, new Map<string, string>())
        }
      }

      const aggregated = aggregateReactions(voteRows ?? [], voterNameById)
      countsByImage = aggregated.countsByImage
      namesByImage = aggregated.namesByImage

      if (user) {
        for (const row of voteRows ?? []) {
          if (
            row.user_id === user.id &&
            isGalleryReaction(row.reaction)
          ) {
            myReactionByImage.set(row.image_id, row.reaction)
          }
        }
      }
    }
  }

  const images: GalleryImage[] = baseImages.map((image) => ({
    id: image.id,
    name: image.name,
    image_path: image.image_path,
    media_type: image.media_type === "video" ? "video" : "image",
    poster_path: image.poster_path ?? null,
    duration_seconds: image.duration_seconds ?? null,
    created_by: image.created_by,
    created_at: image.created_at,
    uploader_name: image.created_by
      ? (uploaderNameById.get(image.created_by) ?? "Unknown")
      : "Unknown",
    reaction_counts: countsByImage.get(image.id) ?? EMPTY_REACTION_COUNTS,
    my_reaction: myReactionByImage.get(image.id) ?? null,
    reaction_names: namesByImage.get(image.id) ?? EMPTY_REACTION_NAMES,
  }))

  return (
    <PortalShell
      appName="Gallery"
      appHref="/"
      containerClassName="mx-auto w-full max-w-7xl px-6 py-24"
      cornerClassName="text-lg"
      topRight={
        user ? (
          <div className="flex items-center gap-4">
            <Link
              href="/upload"
              className="transition-colors hover:text-foreground"
            >
              Manage
            </Link>
            <SignOutButton />
          </div>
        ) : (
          <Link
            href="/auth/login?next=/upload"
            className="transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        )
      }
    >
      <GalleryGrid
        images={images}
        isSignedIn={Boolean(user)}
        viewerName={user?.name ?? "You"}
      />
    </PortalShell>
  )
}
