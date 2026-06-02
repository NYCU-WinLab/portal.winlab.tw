import Link from "next/link"

import { PortalShell } from "@workspace/ui/components/portal-shell"

import { GalleryPagination } from "@/app/_components/gallery-pagination"
import { GalleryGrid } from "@/app/_components/gallery-grid"
import { SignOutButton } from "@/components/sign-out-button"
import {
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
  aggregateReactions,
  isGalleryReaction,
} from "@/lib/gallery/reactions"
import type { GalleryComment, GalleryImage } from "@/lib/gallery/types"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 36

type GalleryHomePageProps = {
  searchParams: Promise<{ page?: string }>
}

export default async function GalleryHomePage({
  searchParams,
}: GalleryHomePageProps) {
  const { page } = await searchParams
  const parsedPage = Number.parseInt(page ?? "1", 10)
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()
  const user = await getCurrentUser()
  const { data, count, error } = await supabase
    .from("gallery_images")
    .select(
      "id, name, image_path, media_type, poster_path, duration_seconds, created_by, created_at, sequence_id, sequence_index",
      { count: "exact" }
    )
    .or("sequence_id.is.null,sequence_index.eq.0")
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) {
    console.error("[gallery] failed to load images", error)
  }

  const coverRows = data ?? []
  const sequenceIds = Array.from(
    new Set(
      coverRows
        .map((image) => image.sequence_id)
        .filter((id): id is string => typeof id === "string")
    )
  )

  const sequenceRowsById = new Map<string, typeof coverRows>()
  if (sequenceIds.length > 0) {
    const { data: sequenceRows, error: sequenceError } = await supabase
      .from("gallery_images")
      .select(
        "id, name, image_path, media_type, poster_path, duration_seconds, created_by, created_at, sequence_id, sequence_index"
      )
      .in("sequence_id", sequenceIds)
      .order("sequence_index", { ascending: true })
      .order("created_at", { ascending: true })
    if (sequenceError) {
      console.error("[gallery] failed to load sequence rows", sequenceError)
    } else {
      for (const row of sequenceRows ?? []) {
        const sequenceId = row.sequence_id
        if (!sequenceId) continue
        const bucket = sequenceRowsById.get(sequenceId) ?? []
        bucket.push(row)
        sequenceRowsById.set(sequenceId, bucket)
      }
    }
  }

  const imageIds = coverRows.map((image) => image.id)
  const creatorIds = Array.from(
    new Set(coverRows.map((image) => image.created_by).filter(Boolean))
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
  const myReactionByImage = new Map<string, GalleryImage["my_reaction"]>()
  let commentsByImage = new Map<string, GalleryComment[]>()

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

  if (imageIds.length > 0) {
    const { data: commentRows, error: commentError } = await supabase
      .from("gallery_comments")
      .select("id, image_id, parent_id, body, created_by, created_at")
      .in("image_id", imageIds)
      .order("created_at", { ascending: true })

    if (commentError) {
      console.error("[gallery] failed to load comments", commentError)
    } else {
      const commenterIds = Array.from(
        new Set((commentRows ?? []).map((row) => row.created_by).filter(Boolean))
      ) as string[]

      let commenterNameById = new Map<string, string>()
      if (commenterIds.length > 0) {
        const { data: commenterProfiles, error: commenterProfilesError } =
          await supabase
            .from("user_profiles")
            .select("id, name, email")
            .in("id", commenterIds)
        if (commenterProfilesError) {
          console.error(
            "[gallery] failed to load commenter profiles",
            commenterProfilesError
          )
        } else {
          commenterNameById = (commenterProfiles ?? []).reduce((map, row) => {
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

      for (const row of commentRows ?? []) {
        const bucket = commentsByImage.get(row.image_id) ?? []
        bucket.push({
          id: row.id,
          image_id: row.image_id,
          parent_id: row.parent_id ?? null,
          body: row.body,
          created_by: row.created_by,
          created_at: row.created_at,
          commenter_name: commenterNameById.get(row.created_by) ?? "Unknown",
        })
        commentsByImage.set(row.image_id, bucket)
      }
    }
  }

  const images: GalleryImage[] = coverRows.map((image) => ({
    id: image.id,
    name: image.name,
    image_path: image.image_path,
    media_type: image.media_type === "video" ? "video" : "image",
    poster_path: image.poster_path ?? null,
    duration_seconds: image.duration_seconds ?? null,
    created_by: image.created_by,
    created_at: image.created_at,
    sequence_id: image.sequence_id ?? null,
    sequence_index:
      typeof image.sequence_index === "number" ? image.sequence_index : null,
    sequence_count: 1,
    sequence_items: [],
    comments: commentsByImage.get(image.id) ?? [],
    uploader_name: image.created_by
      ? (uploaderNameById.get(image.created_by) ?? "Unknown")
      : "Unknown",
    reaction_counts: countsByImage.get(image.id) ?? EMPTY_REACTION_COUNTS,
    my_reaction: myReactionByImage.get(image.id) ?? null,
    reaction_names: namesByImage.get(image.id) ?? EMPTY_REACTION_NAMES,
  }))

  for (const image of images) {
    if (!image.sequence_id) continue
    const items = sequenceRowsById.get(image.sequence_id) ?? []
    if (items.length <= 1) continue
    image.sequence_count = items.length
    image.sequence_items = items.map((item) => ({
      id: item.id,
      name: item.name,
      image_path: item.image_path,
      media_type: item.media_type === "video" ? "video" : "image",
      poster_path: item.poster_path ?? null,
    }))
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))

  return (
    <PortalShell
      appName="Gallery"
      appHref="/"
      containerClassName="mx-auto w-full max-w-7xl px-6 py-24"
      cornerClassName="text-lg"
      bottomLeft={
        <Link
          href="https://portal.winlab.tw"
          className="transition-colors hover:text-foreground"
        >
          ← Portal
        </Link>
      }
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
        viewerId={user?.id ?? null}
        viewerName={user?.name ?? "You"}
      />
      <GalleryPagination page={currentPage} totalPages={totalPages} />
    </PortalShell>
  )
}
