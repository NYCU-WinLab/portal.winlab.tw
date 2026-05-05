import Link from "next/link"

import { PortalShell } from "@workspace/ui/components/portal-shell"

import { GalleryGrid } from "@/app/_components/gallery-grid"
import { SignOutButton } from "@/components/sign-out-button"
import { createClient } from "@/lib/supabase/server"
import type { GalleryImage } from "@/lib/gallery/types"
import { getCurrentUser } from "@/lib/user"

export const dynamic = "force-dynamic"

export default async function GalleryHomePage() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from("gallery_images")
    .select("id, name, image_path, created_by, created_at")
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

  let voteCountsByImage = new Map<string, number>()
  let voterNamesByImage = new Map<string, string[]>()
  if (imageIds.length > 0) {
    const { data: voteRows, error: voteError } = await supabase
      .from("gallery_image_votes")
      .select("image_id, user_id")
      .in("image_id", imageIds)

    if (voteError) {
      console.error("[gallery] failed to load vote counts", voteError)
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
            "[gallery] failed to load voter profiles",
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

      voteCountsByImage = (voteRows ?? []).reduce((map, row) => {
        const current = map.get(row.image_id) ?? 0
        map.set(row.image_id, current + 1)
        return map
      }, new Map<string, number>())

      voterNamesByImage = (voteRows ?? []).reduce((map, row) => {
        const list = map.get(row.image_id) ?? []
        const name = voterNameById.get(row.user_id) ?? "Unknown"
        list.push(name)
        map.set(row.image_id, list)
        return map
      }, new Map<string, string[]>())
    }
  }

  let votedImageSet = new Set<string>()
  if (user && imageIds.length > 0) {
    const { data: myVotes, error: myVotesError } = await supabase
      .from("gallery_image_votes")
      .select("image_id")
      .eq("user_id", user.id)
      .in("image_id", imageIds)

    if (myVotesError) {
      console.error("[gallery] failed to load user votes", myVotesError)
    } else {
      votedImageSet = new Set((myVotes ?? []).map((row) => row.image_id))
    }
  }

  const images: GalleryImage[] = baseImages.map((image) => ({
    ...image,
    uploader_name: image.created_by
      ? (uploaderNameById.get(image.created_by) ?? "Unknown")
      : "Unknown",
    vote_count: voteCountsByImage.get(image.id) ?? 0,
    voted_by_me: votedImageSet.has(image.id),
    voter_names: voterNamesByImage.get(image.id) ?? [],
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
