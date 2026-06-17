import { redirect } from "next/navigation"

import { DeleteButton } from "@/app/upload/_components/delete-button"
import { RenameButton } from "@/app/upload/_components/rename-button"
import { UploadListThumb } from "@/app/upload/_components/upload-list-thumb"
import { UploadForm } from "@/app/upload/_components/upload-form"
import {
  GalleryNavLink,
  galleryShellNavLinkClass,
  galleryPanelClass,
  gallerySans,
  gallerySectionLeadClass,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import { GalleryShell } from "@/components/gallery-shell"
import { SignOutButton } from "@/components/sign-out-button"
import { createClient } from "@/lib/supabase/server"
import type { GalleryImage } from "@/lib/gallery/types"
import { getGalleryImageUrl } from "@/lib/gallery/url"
import { getCurrentUser } from "@/lib/user"
import { cn } from "@workspace/ui/lib/utils"

export const dynamic = "force-dynamic"

export default async function UploadPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login?next=/upload")

  const supabase = await createClient()
  const { data } = await supabase
    .from("gallery_images")
    .select(
      "id, name, image_path, media_type, poster_path, duration_seconds, created_by, created_at"
    )
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })

  const myImages = (data ?? []) as Array<
    Pick<
      GalleryImage,
      | "id"
      | "name"
      | "image_path"
      | "media_type"
      | "poster_path"
      | "duration_seconds"
      | "created_at"
    >
  >

  return (
    <GalleryShell
      active="manage"
      nav={
        <>
          <GalleryNavLink href="/" tone="shell">
            Wall
          </GalleryNavLink>
          <GalleryNavLink href="/upload" active tone="shell">
            Manage
          </GalleryNavLink>
          <SignOutButton className={galleryShellNavLinkClass()} />
        </>
      }
      containerClassName="max-w-3xl"
    >
      <div className="flex flex-col gap-10 sm:gap-12">
        <header className="space-y-2">
          <h1 className={gallerySectionTitleClass()}>Manage</h1>
          <p className={gallerySectionLeadClass()}>
            Upload photos or videos, rename works, and keep your wall tidy.
          </p>
        </header>

        <section className={galleryPanelClass()}>
          <UploadForm />
        </section>

        <section className="space-y-4">
          <h2
            className={cn(gallerySectionTitleClass(), "text-2xl sm:text-3xl")}
          >
            Your uploads ({myImages.length})
          </h2>
          {myImages.length === 0 ? (
            <p className={gallerySectionLeadClass()}>
              You haven&apos;t uploaded anything yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {myImages.map((image) => {
                const isVideo = image.media_type === "video"
                const thumbPath =
                  isVideo && image.poster_path
                    ? image.poster_path
                    : image.image_path
                return (
                  <li
                    key={image.id}
                    className={cn(
                      galleryPanelClass(),
                      "flex items-center gap-4 !p-4 sm:gap-5"
                    )}
                  >
                    <UploadListThumb
                      src={getGalleryImageUrl(thumbPath)}
                      alt={image.name}
                      isVideo={isVideo}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p
                        className={cn(
                          gallerySectionTitleClass(),
                          "truncate text-lg sm:text-xl"
                        )}
                      >
                        {image.name}
                      </p>
                      <p
                        className={cn(
                          gallerySans(),
                          "text-xs text-muted-foreground"
                        )}
                      >
                        {new Date(image.created_at).toLocaleDateString(
                          undefined,
                          {
                            dateStyle: "medium",
                          }
                        )}
                        {isVideo && image.duration_seconds
                          ? ` · ${image.duration_seconds}s video`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <RenameButton id={image.id} name={image.name} />
                      <DeleteButton
                        id={image.id}
                        imagePath={image.image_path}
                        posterPath={image.poster_path}
                        name={image.name}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </GalleryShell>
  )
}
