import Link from "next/link"

import { PortalShell } from "@workspace/ui/components/portal-shell"

import { GalleryGrid } from "@/app/_components/gallery-grid"
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

  let voteCountsByImage = new Map<string, number>()
  if (imageIds.length > 0) {
    const { data: voteRows, error: voteError } = await supabase
      .from("gallery_image_votes")
      .select("image_id")
      .in("image_id", imageIds)

    if (voteError) {
      console.error("[gallery] failed to load vote counts", voteError)
    } else {
      voteCountsByImage = (voteRows ?? []).reduce((map, row) => {
        const current = map.get(row.image_id) ?? 0
        map.set(row.image_id, current + 1)
        return map
      }, new Map<string, number>())
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
    vote_count: voteCountsByImage.get(image.id) ?? 0,
    voted_by_me: votedImageSet.has(image.id),
  }))

  return (
    <PortalShell
      appName="Gallery"
      appHref="/"
      containerClassName="mx-auto w-full max-w-7xl px-6 py-24"
      cornerClassName="text-lg"
      topRight={
        <Link
          href={user ? "/upload" : "/auth/login?next=/upload"}
          className="transition-colors hover:text-foreground"
        >
          {user ? "Upload" : "Sign in"}
        </Link>
      }
    >
      <GalleryGrid images={images} isSignedIn={Boolean(user)} />
    </PortalShell>
  )
}
