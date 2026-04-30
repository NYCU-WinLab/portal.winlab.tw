import Link from "next/link"

import { PortalShell } from "@workspace/ui/components/portal-shell"

import { GalleryGrid } from "@/app/_components/gallery-grid"
import { createClient } from "@/lib/supabase/server"
import type { GalleryImage } from "@/lib/gallery/types"
import { getCurrentUser } from "@/lib/user"

export const dynamic = "force-dynamic"

export default async function GalleryHomePage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("gallery_images")
    .select("id, name, image_path, created_by, created_at")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[gallery] failed to load images", error)
  }

  const images = (data ?? []) as GalleryImage[]
  const user = await getCurrentUser()

  return (
    <PortalShell
      appName="Gallery"
      appHref="/"
      containerClassName="mx-auto w-full max-w-7xl px-6 py-24"
      cornerClassName="text-lg"
      topRight={
        <Link
          href={user ? "/upload" : "/auth/login?next=/upload"}
          className="transition-colors hover:text-foreground"
        >
          {user ? "Upload" : "Sign in"}
        </Link>
      }
    >
      <GalleryGrid images={images} />
    </PortalShell>
  )
}
