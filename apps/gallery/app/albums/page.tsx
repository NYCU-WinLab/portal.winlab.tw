import type { Metadata } from "next"
import Link from "next/link"

import { GalleryAlbumCard } from "@/app/albums/_components/album-card"
import { GalleryAlbumCreateForm } from "@/app/albums/_components/album-create-form"
import { GalleryPageHero } from "@/app/_components/gallery-page-hero"
import {
  GalleryEmptyState,
  galleryPanelClass,
  gallerySans,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import { GalleryThemedShell } from "@/components/gallery-shell"
import { loadGalleryAlbumSummaries } from "@/lib/gallery/load-albums"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import { cn } from "@workspace/ui/lib/utils"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Albums · Gallery",
  description: "Curated photo collections from the WinLab paper wall.",
}

export default async function GalleryAlbumsPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  const albums = await loadGalleryAlbumSummaries(supabase)

  return (
    <GalleryThemedShell active="albums" signedIn={Boolean(user)}>
      <div className="flex flex-col gap-10 sm:gap-12">
        <GalleryPageHero
          title="Albums"
          lead="Curated collections pulled from the wall — share a slug, keep the story together. Distinct from tags and burst sequences."
        />

        {user ? (
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

        {albums.length === 0 ? (
          <GalleryEmptyState
            title="No albums yet"
            description={
              user
                ? "Name a collection above, then add photos from any lightbox on the wall."
                : "When lab members curate collections, they will show up here."
            }
            action={
              <Link
                href="/"
                className={cn(
                  gallerySans(),
                  "text-sm text-foreground underline-offset-2 hover:underline"
                )}
              >
                Back to the wall
              </Link>
            }
          />
        ) : (
          <section className="space-y-4">
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
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4">
              {albums.map((album) => (
                <li key={album.id}>
                  <GalleryAlbumCard album={album} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </GalleryThemedShell>
  )
}
