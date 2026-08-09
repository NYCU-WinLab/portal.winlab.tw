import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { GalleryAlbumManagePanel } from "@/app/albums/_components/album-manage-panel"
import { GalleryAlbumPhotoGrid } from "@/app/albums/_components/album-photo-grid"
import { GalleryPageHero } from "@/app/_components/gallery-page-hero"
import { GalleryEmptyState, gallerySans } from "@/components/gallery-chrome"
import { GalleryThemedShell } from "@/components/gallery-shell"
import { loadGalleryAlbumBySlug } from "@/lib/gallery/load-albums"
import {
  DEFAULT_GALLERY_METADATA,
  resolveGallerySiteOrigin,
} from "@/lib/gallery/og-metadata"
import { getGalleryThumbUrl } from "@/lib/gallery/url"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import { cn } from "@workspace/ui/lib/utils"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"

type AlbumPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: AlbumPageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const album = await loadGalleryAlbumBySlug(supabase, slug)
  if (!album) return DEFAULT_GALLERY_METADATA

  const headerStore = await headers()
  const origin = resolveGallerySiteOrigin(headerStore.get("host"))
  const cover = album.photos[0]
  const coverPath =
    cover?.media_type === "video" && cover.poster_path
      ? cover.poster_path
      : cover?.image_path
  const ogImage = coverPath ? getGalleryThumbUrl(coverPath, 1200) : undefined

  return {
    title: `${album.title} · Gallery`,
    description:
      album.description ??
      `Album curated by ${album.owner_name} on the WinLab gallery wall.`,
    openGraph: {
      title: album.title,
      description: album.description ?? undefined,
      url: `${origin}/albums/${album.slug}`,
      images: ogImage
        ? [{ url: ogImage, width: 1200, height: 1500 }]
        : undefined,
    },
  }
}

export default async function GalleryAlbumDetailPage({
  params,
}: AlbumPageProps) {
  const { slug } = await params
  const supabase = await createClient()
  const [user, album] = await Promise.all([
    getCurrentUser(),
    loadGalleryAlbumBySlug(supabase, slug),
  ])

  if (!album) notFound()

  const canManage =
    Boolean(user) && (user?.id === album.created_by || Boolean(user?.isAdmin))

  return (
    <GalleryThemedShell active="albums" signedIn={Boolean(user)}>
      <div className="flex flex-col gap-10 sm:gap-12">
        <div className="space-y-4">
          <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
            <Link href="/albums" className="underline-offset-2 hover:underline">
              Albums
            </Link>
            <span aria-hidden> / </span>
            <span className="text-foreground">{album.slug}</span>
          </p>
          <GalleryPageHero
            title={album.title}
            lead={
              album.description ??
              `${album.photos.length} photo${album.photos.length === 1 ? "" : "s"} curated by ${album.owner_name}.`
            }
          />
          <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
            by {album.owner_name}
            <span aria-hidden> · </span>
            {album.photos.length} photo
            {album.photos.length === 1 ? "" : "s"}
            <span aria-hidden> · </span>
            <a
              href={`/albums/${album.slug}`}
              className="underline-offset-2 hover:underline"
            >
              shareable link
            </a>
          </p>
        </div>

        {album.photos.length === 0 ? (
          <GalleryEmptyState
            title="Still empty"
            description={
              canManage
                ? "Open any photo on the wall and choose Add to album."
                : "The curator has not hung any photos here yet."
            }
            action={
              <Link
                href="/"
                className={cn(
                  gallerySans(),
                  "text-sm text-foreground underline-offset-2 hover:underline"
                )}
              >
                Browse the wall
              </Link>
            }
          />
        ) : (
          <GalleryAlbumPhotoGrid photos={album.photos} />
        )}

        {canManage ? <GalleryAlbumManagePanel album={album} /> : null}
      </div>
    </GalleryThemedShell>
  )
}
