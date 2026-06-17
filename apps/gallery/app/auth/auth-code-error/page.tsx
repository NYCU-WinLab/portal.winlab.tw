import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import {
  galleryPanelClass,
  gallerySectionLeadClass,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import { GalleryShell } from "@/components/gallery-shell"

export default function AuthCodeErrorPage() {
  return (
    <GalleryShell>
      <div className="flex min-h-[50vh] flex-col justify-center">
        <div className={galleryPanelClass()}>
          <div className="mx-auto flex w-full max-w-md flex-col gap-6">
            <div className="space-y-2">
              <h1 className={gallerySectionTitleClass()}>Sign in failed</h1>
              <p className={gallerySectionLeadClass()}>
                The sign-in link was invalid or expired. Try again.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="/auth/login">Back to sign in</Link>
            </Button>
          </div>
        </div>
      </div>
    </GalleryShell>
  )
}
