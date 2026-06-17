import { GalleryGrid } from "@/app/_components/gallery-grid"
import { GalleryPagination } from "@/app/_components/gallery-pagination"
import { SignOutButton } from "@/components/sign-out-button"
import {
  GalleryNavLink,
  galleryShellNavLinkClass,
} from "@/components/gallery-chrome"
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

  const nav = user ? (
    <>
      <GalleryNavLink href="/upload" tone="shell">
        Manage
      </GalleryNavLink>
      <SignOutButton className={galleryShellNavLinkClass()} />
    </>
  ) : (
    <GalleryNavLink href="/auth/login?next=/upload" tone="shell">
      Sign in
    </GalleryNavLink>
  )

  return (
    <GalleryShell active="home" nav={nav}>
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
