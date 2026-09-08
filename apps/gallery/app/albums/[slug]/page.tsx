import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { GalleryAlbumManagePanel } from "@/app/albums/_components/album-manage-panel"
import { GalleryAlbumPhotoGrid } from "@/app/albums/_components/album-photo-grid"
import { AlbumSlideshowButton } from "@/app/albums/_components/album-slideshow"
import { DownloadAlbumButton } from "@/app/_components/download-album-button"
import { GalleryPageHero } from "@/app/_components/gallery-page-hero"
import { ShareAlbumButton } from "@/app/_components/share-album-button"
import { GalleryEmptyState, gallerySans } from "@/components/gallery-chrome"
import { GalleryThemedShell } from "@/components/gallery-shell"
import { loadGalleryAlbumBySlug } from "@/lib/gallery/load-albums"
import { isGalleryAlbumsReady } from "@/lib/gallery/albums"
import {
  describeAlbumPageNotReadyDescription,
  describeAlbumStillEmptyDescription,
  describeAlbumStillEmptyTitle,
  describeAlbumsNotReadyTitle,
  describeBackToTheWallLabel,
  describeBrowseTheWallLabel,
} from "@/lib/gallery/empty-state-labels"
import {
  describeCopyShareLinkLabel,
  describeShareAlbumLabel,
} from "@/lib/gallery/album-share-toast"
import {
  DEFAULT_GALLERY_METADATA,
  resolveGallerySiteOrigin,
} from "@/lib/gallery/og-metadata"
import { getGalleryThumbUrl } from "@/lib/gallery/url"
import { createClient } from "@/lib/supabase/server"
import { loadFavoritedImageIds } from "@/lib/gallery/favorites"
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
  const cover =
    (album.cover_image_id
      ? album.photos.find((photo) => photo.image_id === album.cover_image_id)
      : null) ?? album.photos[0]
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
    twitter: {
      card: "summary_large_image",
      title: album.title,
      description:
        album.description ??
        `Album curated by ${album.owner_name} on the WinLab gallery wall.`,
      images: ogImage ? [ogImage] : undefined,
    },
  }
}

export default async function GalleryAlbumDetailPage({
  params,
}: AlbumPageProps) {
  const { slug } = await params
  const supabase = await createClient()
  const [user, albumsReady] = await Promise.all([
    getCurrentUser(),
    isGalleryAlbumsReady(supabase),
  ])

  if (!albumsReady) {
    return (
      <GalleryThemedShell active="albums" signedIn={Boolean(user)}>
        <div className="flex flex-col gap-6">
          <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
            <Link href="/albums" className="underline-offset-2 hover:underline">
              Albums
            </Link>
          </p>
          <GalleryEmptyState
            title={describeAlbumsNotReadyTitle()}
            description={describeAlbumPageNotReadyDescription()}
            action={
              <Link
                href="/"
                className={cn(
                  gallerySans(),
                  "text-sm text-foreground underline-offset-2 hover:underline"
                )}
              >
                {describeBackToTheWallLabel()}
              </Link>
            }
          />
        </div>
      </GalleryThemedShell>
    )
  }

  const album = await loadGalleryAlbumBySlug(supabase, slug)
  if (!album) notFound()

  if (user) {
    const favoritedIds = await loadFavoritedImageIds(
      supabase,
      user.id,
      album.photos.map((photo) => photo.image_id)
    )
    for (const photo of album.photos) {
      photo.is_favorited = favoritedIds.has(photo.image_id)
    }
  }

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
          <p
            className={cn(
              gallerySans(),
              "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
            )}
          >
            <span>
              by {album.owner_name}
              <span aria-hidden> · </span>
              {album.photos.length} photo
              {album.photos.length === 1 ? "" : "s"}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <ShareAlbumButton
              slug={album.slug}
              title={album.title}
              emphasize={canManage}
              label={
                canManage
                  ? describeCopyShareLinkLabel()
                  : describeShareAlbumLabel()
              }
            />
            {album.photos.length > 0 ? (
              <>
                <AlbumSlideshowButton
                  photos={album.photos}
                  albumTitle={album.title}
                  className={cn(
                    gallerySans(),
                    "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-xs",
                    "hover:bg-accent hover:text-accent-foreground"
                  )}
                />
                <Link
                  href={`/?album=${encodeURIComponent(album.slug)}`}
                  className={cn(
                    gallerySans(),
                    "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-xs",
                    "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  View on wall
                </Link>
                <DownloadAlbumButton
                  className={cn(
                    gallerySans(),
                    "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-xs",
                    "hover:bg-accent hover:text-accent-foreground"
                  )}
                  albumTitle={album.title}
                  items={album.photos.map((photo) => ({
                    name: photo.name,
                    image_path: photo.image_path,
                    position: photo.position,
                  }))}
                />
              </>
            ) : null}
          </div>
          {canManage ? (
            <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
              Anyone with the link can open{" "}
              <span className="text-foreground">/albums/{album.slug}</span> —
              copy it above to share.
            </p>
          ) : null}
        </div>

        {album.photos.length === 0 ? (
          <GalleryEmptyState
            title={describeAlbumStillEmptyTitle()}
            description={describeAlbumStillEmptyDescription(canManage)}
            action={
              <Link
                href="/"
                className={cn(
                  gallerySans(),
                  "text-sm text-foreground underline-offset-2 hover:underline"
                )}
              >
                {describeBrowseTheWallLabel()}
              </Link>
            }
          />
        ) : (
          <GalleryAlbumPhotoGrid
            photos={album.photos}
            albumTitle={album.title}
            signedIn={Boolean(user)}
            viewerId={user?.id ?? null}
            viewerName={user?.name ?? "You"}
            isAdmin={Boolean(user?.isAdmin)}
          />
        )}

        {canManage ? <GalleryAlbumManagePanel album={album} /> : null}
      </div>
    </GalleryThemedShell>
  )
}
