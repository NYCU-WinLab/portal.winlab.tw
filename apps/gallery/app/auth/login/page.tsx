import { redirect } from "next/navigation"

import { AuthStateReset } from "@/components/auth-state-reset"
import { SignInButton } from "@/components/sign-in-button"
import {
  galleryPanelClass,
  gallerySectionLeadClass,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import { GalleryThemedShell } from "@/components/gallery-shell"
import { getCurrentUser } from "@/lib/user"

type LoginPageProps = {
  searchParams: Promise<{ next?: string; stale?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser()
  const { next, stale } = await searchParams
  const safeNext = next && next.startsWith("/") ? next : "/"
  if (user) redirect(safeNext)

  return (
    <GalleryThemedShell>
      <AuthStateReset />
      <div className="flex min-h-[50vh] flex-col justify-center">
        <div className={galleryPanelClass()}>
          <div className="mx-auto flex w-full max-w-md flex-col gap-6">
            <div className="space-y-2">
              <h1 className={gallerySectionTitleClass()}>Sign in</h1>
              <p className={gallerySectionLeadClass()}>
                Continue with your WinLab SSO account.
              </p>
              {stale === "1" ? (
                <p className="text-sm text-muted-foreground">
                  Cleared a leftover session. Try signing in again.
                </p>
              ) : null}
            </div>
            <SignInButton next={safeNext} />
          </div>
        </div>
      </div>
    </GalleryThemedShell>
  )
}
