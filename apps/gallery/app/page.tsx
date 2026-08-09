import { Suspense } from "react"
import type { Metadata } from "next"
import { headers } from "next/headers"

import { GalleryInfiniteWall } from "@/app/_components/gallery-infinite-wall"
import { GalleryHomeFiltersBar } from "@/app/_components/gallery-home-filters"
import { GalleryHomeHero } from "@/app/_components/gallery-home-hero"
import { GalleryGrid } from "@/app/_components/gallery-grid"
import { GalleryThemedShell } from "@/components/gallery-shell"
import { parseGalleryHomeFilters } from "@/lib/gallery/home-filters"
import { loadGalleryHomePages } from "@/lib/gallery/load-home-page"
import {
  buildGalleryPhotoMetadata,
  DEFAULT_GALLERY_METADATA,
  resolveGallerySiteOrigin,
} from "@/lib/gallery/og-metadata"
import { resolveGalleryPhotoDeepLink } from "@/lib/gallery/photo-deep-link"
import type { GalleryTagSuggestion } from "@/lib/gallery/tags"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

export const dynamic = "force-dynamic"

type GalleryHomePageProps = {
  searchParams: Promise<{
    page?: string
    photo?: string
    comment?: string
    uploader?: string
    media?: string
    after?: string
    q?: string
    tag?: string
  }>
}

export async function generateMetadata({
  searchParams,
}: GalleryHomePageProps): Promise<Metadata> {
  const { photo } = await searchParams
  const photoId = photo?.trim()
  if (!photoId) return DEFAULT_GALLERY_METADATA

  const supabase = await createClient()
  const { data } = await supabase
    .from("gallery_images")
    .select("name, image_path, media_type, poster_path")
    .eq("id", photoId)
    .maybeSingle()

  if (!data) return DEFAULT_GALLERY_METADATA

  const headerStore = await headers()
  const origin = resolveGallerySiteOrigin(headerStore.get("host"))

  return buildGalleryPhotoMetadata(data, origin, photoId)
}

export default async function GalleryHomePage({
  searchParams,
}: GalleryHomePageProps) {
  const { page, photo, comment, uploader, media, after, q, tag } =
    await searchParams
  const filters = parseGalleryHomeFilters({ uploader, media, after, q, tag })
  const parsedPage = Number.parseInt(page ?? "1", 10)
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const photoId = photo?.trim() || null
  const commentId = comment?.trim() || null

  const supabase = await createClient()
  const user = await getCurrentUser()

  let openPhotoId = photoId
  const openCommentId = commentId
  let throughPage = requestedPage

  if (photoId) {
    const resolved = await resolveGalleryPhotoDeepLink(supabase, photoId)
    if (resolved) {
      openPhotoId = resolved.coverId
      throughPage = Math.max(requestedPage, resolved.page)
    }
  }

  const [{ images, members, currentPage, hasMore }, popularTagsResult] =
    await Promise.all([
      loadGalleryHomePages(supabase, {
        throughPage,
        userId: user?.id ?? null,
        filters,
      }),
      supabase.rpc("gallery_list_popular_tags", { p_limit: 40 }),
    ])

  // Soft-fail when gallery_list_popular_tags is missing (migration not applied).
  const popularTags: GalleryTagSuggestion[] = popularTagsResult.error
    ? []
    : ((popularTagsResult.data ?? []) as GalleryTagSuggestion[]).map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        use_count: Number(row.use_count) || 0,
      }))

  return (
    <GalleryThemedShell active="home" signedIn={Boolean(user)}>
      <div className="overflow-x-clip">
        <GalleryHomeHero />
        {user ? (
          <Suspense fallback={null}>
            <GalleryHomeFiltersBar
              filters={filters}
              members={members}
              popularTags={popularTags}
            />
          </Suspense>
        ) : filters.tagSlug ? (
          <p className="mx-auto mb-6 max-w-md px-6 text-center text-xs text-zinc-600">
            Showing tag{" "}
            <span className="font-medium text-foreground">
              #
              {popularTags.find((item) => item.slug === filters.tagSlug)
                ?.slug ?? filters.tagSlug}
            </span>
          </p>
        ) : null}
        <Suspense
          fallback={
            <GalleryGrid
              images={images}
              isSignedIn={Boolean(user)}
              viewerId={user?.id ?? null}
              viewerName={user?.name ?? "You"}
              members={members}
              isAdmin={user?.isAdmin ?? false}
            />
          }
        >
          <GalleryInfiniteWall
            key={[
              filters.uploaderId ?? "",
              filters.media,
              filters.uploadedAfter ?? "",
              filters.query ?? "",
              filters.tagSlug ?? "",
              String(currentPage),
            ].join("|")}
            initialImages={images}
            initialPage={currentPage}
            initialHasMore={hasMore}
            filters={filters}
            isSignedIn={Boolean(user)}
            viewerId={user?.id ?? null}
            viewerName={user?.name ?? "You"}
            members={members}
            isAdmin={user?.isAdmin ?? false}
            openPhotoId={openPhotoId}
            openCommentId={openCommentId}
          />
        </Suspense>
      </div>
    </GalleryThemedShell>
  )
}
