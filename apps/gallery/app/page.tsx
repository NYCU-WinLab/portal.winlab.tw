import { GalleryGrid } from "@/app/_components/gallery-grid"
import { GalleryPagination } from "@/app/_components/gallery-pagination"
import { GalleryShell } from "@/components/gallery-shell"
import { loadGalleryHomePage } from "@/lib/gallery/load-home-page"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

export const dynamic = "force-dynamic"

type GalleryHomePageProps = {
  searchParams: Promise<{ page?: string }>
}

export default async function GalleryHomePage({
  searchParams,
}: GalleryHomePageProps) {
  const { page } = await searchParams
  const parsedPage = Number.parseInt(page ?? "1", 10)

  const supabase = await createClient()
  const user = await getCurrentUser()

  const { images, members, totalPages, currentPage } =
    await loadGalleryHomePage(supabase, {
      page: parsedPage,
      userId: user?.id ?? null,
    })

  return (
    <GalleryShell active="home" signedIn={Boolean(user)}>
      <div className="overflow-x-clip">
        <GalleryGrid
          images={images}
          isSignedIn={Boolean(user)}
          viewerId={user?.id ?? null}
          viewerName={user?.name ?? "You"}
          members={members}
        />
        <GalleryPagination page={currentPage} totalPages={totalPages} />
      </div>
    </GalleryShell>
  )
}
