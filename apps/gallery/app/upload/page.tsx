import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import { PortalShell } from "@workspace/ui/components/portal-shell"

import { DeleteButton } from "@/app/upload/_components/delete-button"
import { UploadForm } from "@/app/upload/_components/upload-form"
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
      bottomLeft={
        <Link href="/" className="transition-colors hover:text-foreground">
          Back
        </Link>
      }
    >
      <div className="flex flex-col gap-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-6xl tracking-tight italic md:text-7xl">
            Your works
          </h1>
          <p className="text-lg text-muted-foreground md:text-xl">
            Upload your own. Delete what no longer fits.
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
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden">
                    <Image
                      src={getGalleryImageUrl(image.image_path)}
                      alt={image.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <p className="text-2xl italic">{image.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(image.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <DeleteButton
                    id={image.id}
                    imagePath={image.image_path}
                    name={image.name}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PortalShell>
  )
}
