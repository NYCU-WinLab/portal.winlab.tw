import { Suspense } from "react"
import { redirect } from "next/navigation"

import { GalleryGrid } from "@/app/_components/gallery-grid"
import { GalleryHomeFiltersBar } from "@/app/_components/gallery-home-filters"
import { GalleryPagination } from "@/app/_components/gallery-pagination"
import { GalleryThemedShell } from "@/components/gallery-shell"
import { parseGalleryHomeFilters } from "@/lib/gallery/home-filters"
import { loadGalleryHomePage } from "@/lib/gallery/load-home-page"
import {
  buildGalleryPhotoHref,
  resolveGalleryPhotoDeepLink,
} from "@/lib/gallery/photo-deep-link"
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
  }>
}

export default async function GalleryHomePage({
  searchParams,
}: GalleryHomePageProps) {
  const { page, photo, comment, uploader, media, after } = await searchParams
  const filters = parseGalleryHomeFilters({ uploader, media, after })
  const parsedPage = Number.parseInt(page ?? "1", 10)
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const photoId = photo?.trim() || null
  const commentId = comment?.trim() || null

  const supabase = await createClient()
  const user = await getCurrentUser()

  let openPhotoId = photoId
  let openCommentId = commentId
  let loadPage = requestedPage

  if (photoId) {
    const resolved = await resolveGalleryPhotoDeepLink(supabase, photoId)
    if (resolved) {
      openPhotoId = resolved.coverId
      if (resolved.page !== requestedPage) {
        redirect(
          buildGalleryPhotoHref({
            photoId: resolved.coverId,
            commentId,
            page: resolved.page,
          })
        )
      }
      loadPage = resolved.page
    }
  }

  const { images, members, totalPages, currentPage } =
    await loadGalleryHomePage(supabase, {
      page: loadPage,
      userId: user?.id ?? null,
      filters,
    })

  return (
    <GalleryThemedShell active="home" signedIn={Boolean(user)}>
      <div className="overflow-x-clip">
        {user ? (
          <Suspense fallback={null}>
            <GalleryHomeFiltersBar filters={filters} members={members} />
          </Suspense>
        ) : null}
        <Suspense
          fallback={
            <GalleryGrid
              images={images}
              isSignedIn={Boolean(user)}
              viewerId={user?.id ?? null}
              viewerName={user?.name ?? "You"}
              members={members}
            />
          }
        >
          <GalleryGrid
            images={images}
            isSignedIn={Boolean(user)}
            viewerId={user?.id ?? null}
            viewerName={user?.name ?? "You"}
            members={members}
            openPhotoId={openPhotoId}
            openCommentId={openCommentId}
          />
        </Suspense>
        <GalleryPagination
          page={currentPage}
          totalPages={totalPages}
          filters={filters}
        />
      </div>
    </GalleryThemedShell>
  )
}
