import Link from "next/link"
import { redirect } from "next/navigation"

import { PortalShell } from "@workspace/ui/components/portal-shell"

import { DeleteButton } from "@/app/upload/_components/delete-button"
import { RenameButton } from "@/app/upload/_components/rename-button"
import { UploadListThumb } from "@/app/upload/_components/upload-list-thumb"
import { UploadForm } from "@/app/upload/_components/upload-form"
import { SignOutButton } from "@/components/sign-out-button"
import { createClient } from "@/lib/supabase/server"
import type { GalleryImage } from "@/lib/gallery/types"
import { getGalleryImageUrl } from "@/lib/gallery/url"
import { getCurrentUser } from "@/lib/user"

export const dynamic = "force-dynamic"

export default async function UploadPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login?next=/upload")

  const supabase = await createClient()
  const { data } = await supabase
    .from("gallery_images")
    .select("id, name, image_path, created_by, created_at")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })

  const myImages = (data ?? []) as GalleryImage[]

  return (
    <PortalShell
      appName="Gallery"
      appHref="/"
      containerClassName="mx-auto w-full max-w-3xl px-6 py-24"
      cornerClassName="text-lg"
      topRight={<SignOutButton />}
      bottomLeft={
        <Link href="/" className="transition-colors hover:text-foreground">
          Back
        </Link>
      }
    >
      <div className="flex flex-col gap-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-6xl tracking-tight italic md:text-7xl">
            Manage works
          </h1>
          <p className="text-lg text-muted-foreground md:text-xl">
            Upload your own. Edit names, delete, and keep your wall tidy.
          </p>
        </div>

        <UploadForm />

        <section className="flex flex-col gap-6">
          <h2 className="text-3xl italic">
            Uploaded by you ({myImages.length})
          </h2>
          {myImages.length === 0 ? (
            <p className="text-base text-muted-foreground italic">
              You haven&rsquo;t uploaded anything yet.
            </p>
          ) : (
            <ul className="flex flex-col">
              {myImages.map((image) => (
                <li
                  key={image.id}
                  className="flex items-center gap-6 border-b border-border/60 py-5 last:border-b-0"
                >
                  <UploadListThumb
                    src={getGalleryImageUrl(image.image_path)}
                    alt={image.name}
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <p className="text-2xl italic">{image.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(image.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <RenameButton id={image.id} name={image.name} />
                    <DeleteButton
                      id={image.id}
                      imagePath={image.image_path}
                      name={image.name}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PortalShell>
  )
}
