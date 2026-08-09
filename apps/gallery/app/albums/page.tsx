import type { Metadata } from "next"
import Link from "next/link"

import { GalleryAlbumCard } from "@/app/albums/_components/album-card"
import { GalleryAlbumCreateForm } from "@/app/albums/_components/album-create-form"
import { GalleryAlbumsSearch } from "@/app/albums/_components/albums-search"
import { GalleryPageHero } from "@/app/_components/gallery-page-hero"
import {
  GalleryEmptyState,
  galleryPanelClass,
  gallerySans,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import { GalleryThemedShell } from "@/components/gallery-shell"
import { loadGalleryAlbumSummaries } from "@/lib/gallery/load-albums"
import { albumMatchesQuery, isGalleryAlbumsReady } from "@/lib/gallery/albums"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import { cn } from "@workspace/ui/lib/utils"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Albums · Gallery",
  description: "Curated photo collections from the WinLab paper wall.",
}

type AlbumsPageProps = {
  searchParams: Promise<{ mine?: string; q?: string }>
}

export default async function GalleryAlbumsPage({
  searchParams,
}: AlbumsPageProps) {
  const { mine, q } = await searchParams
  const mineOnly = mine === "1" || mine === "true"
  const query = q?.trim() || null
  const supabase = await createClient()
  const [user, albumsReady] = await Promise.all([
    getCurrentUser(),
    isGalleryAlbumsReady(supabase),
  ])
  const albums = albumsReady ? await loadGalleryAlbumSummaries(supabase) : []
  const visibleAlbums = albums.filter((album) => {
    if (mineOnly && user && album.created_by !== user.id) return false
    if (query && !albumMatchesQuery(album, query)) return false
    return true
  })

  return (
    <GalleryThemedShell active="albums" signedIn={Boolean(user)}>
      <div className="flex flex-col gap-10 sm:gap-12">
        <GalleryPageHero
          title="Albums"
          lead="Curated collections pulled from the wall — share a slug, keep the story together. Distinct from tags and burst sequences."
        />

        {!albumsReady ? (
          <GalleryEmptyState
            title="Albums not ready yet"
            description="Apply the gallery albums migration, then refresh — Manage already soft-hides album tools until then."
            action={
              <Link
                href="/"
                className="underline decoration-zinc-400/80 underline-offset-4 hover:decoration-zinc-700"
              >
                Back to the wall
              </Link>
            }
          />
        ) : user ? (
          <section className={cn(galleryPanelClass(), "space-y-5")}>
            <div className="space-y-1">
              <p
                className={cn(
                  gallerySans(),
                  "text-[10px] tracking-[0.22em] text-muted-foreground uppercase"
                )}
              >
                New collection
              </p>
              <h2
                className={cn(
                  gallerySectionTitleClass(),
                  "text-2xl sm:text-3xl"
                )}
              >
                Start an album
              </h2>
            </div>
            <GalleryAlbumCreateForm />
          </section>
        ) : (
          <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
            <Link
              href="/auth/login?next=/albums"
              className="underline-offset-2 hover:underline"
            >
              Sign in
            </Link>{" "}
            to curate albums. Anyone with a link can still browse them.
          </p>
        )}

        {albumsReady ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <p
                  className={cn(
                    gallerySans(),
                    "text-[10px] tracking-[0.22em] text-muted-foreground uppercase"
                  )}
                >
                  Collections
                </p>
                <h2
                  className={cn(
                    gallerySectionTitleClass(),
                    "text-2xl sm:text-3xl"
                  )}
                >
                  On the shelf
                </h2>
              </div>
              {user ? (
                <p
                  className={cn(gallerySans(), "text-xs text-muted-foreground")}
                >
                  {mineOnly ? (
                    <Link
                      href={
                        query
                          ? `/albums?q=${encodeURIComponent(query)}`
                          : "/albums"
                      }
                      className="underline-offset-2 hover:underline"
                    >
                      Show all albums
                    </Link>
                  ) : (
                    <Link
                      href={
                        query
                          ? `/albums?mine=1&q=${encodeURIComponent(query)}`
                          : "/albums?mine=1"
                      }
                      className="underline-offset-2 hover:underline"
                    >
                      My albums only
                    </Link>
                  )}
                </p>
              ) : null}
            </div>

            <GalleryAlbumsSearch
              initialQuery={query ?? ""}
              mineOnly={mineOnly}
            />

            {visibleAlbums.length === 0 ? (
              <GalleryEmptyState
                title={
                  query
                    ? "No albums match that search"
                    : mineOnly
                      ? "You have no albums yet"
                      : "No albums yet"
                }
                description={
                  query
                    ? "Try another title, slug, owner, or clear the search."
                    : mineOnly
                      ? "Create one above, or clear the filter to browse everyone else’s collections."
                      : user
                        ? "Name a collection above, then add photos from any lightbox on the wall."
                        : "When lab members curate collections, they will show up here."
                }
                action={
                  <p className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                    {query ? (
                      <Link
                        href={mineOnly ? "/albums?mine=1" : "/albums"}
                        className={cn(
                          gallerySans(),
                          "text-sm text-foreground underline-offset-2 hover:underline"
                        )}
                      >
                        Clear search
                      </Link>
                    ) : null}
                    <Link
                      href={query || mineOnly ? "/albums" : "/"}
                      className={cn(
                        gallerySans(),
                        "text-sm text-foreground underline-offset-2 hover:underline"
                      )}
                    >
                      {query || mineOnly
                        ? "Show all albums"
                        : "Back to the wall"}
                    </Link>
                  </p>
                }
              />
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4">
                {visibleAlbums.map((album) => (
                  <li key={album.id}>
                    <GalleryAlbumCard
                      album={album}
                      showShare={
                        Boolean(user) &&
                        (user?.id === album.created_by ||
                          Boolean(user?.isAdmin))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </GalleryThemedShell>
  )
}
