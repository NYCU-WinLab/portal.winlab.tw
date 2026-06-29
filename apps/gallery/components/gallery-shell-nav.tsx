"use client"

import Link from "next/link"
import {
  IconExternalLink,
  IconLayoutGrid,
  IconLogin,
  IconMenu2,
  IconPhotoEdit,
} from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

import {
  GalleryNavLink,
  gallerySans,
  galleryShellIconButtonClass,
  galleryShellNavLinkClass,
} from "@/components/gallery-chrome"
import { GalleryMentionBell } from "@/components/gallery-mention-bell"
import { SignOutButton } from "@/components/sign-out-button"
import type { GalleryMentionNotification } from "@/lib/gallery/mention-notifications"

export type GalleryShellActive = "home" | "manage"

export function GalleryShellNav({
  active,
  signedIn,
  viewerId = null,
  mentionNotifications = [],
}: {
  active: GalleryShellActive
  signedIn: boolean
  viewerId?: string | null
  mentionNotifications?: GalleryMentionNotification[]
}) {
  return (
    <>
      {signedIn && viewerId ? (
        <GalleryMentionBell
          viewerId={viewerId}
          initialNotifications={mentionNotifications}
        />
      ) : null}

      <nav
        className={cn(
          gallerySans(),
          "relative z-10 hidden shrink-0 items-center justify-end gap-4 md:flex"
        )}
      >
        <GalleryNavLink href="https://portal.winlab.tw" external tone="shell">
          Portal
        </GalleryNavLink>
        {signedIn ? (
          <>
            {active !== "manage" ? (
              <GalleryNavLink href="/upload" tone="shell">
                Manage
              </GalleryNavLink>
            ) : null}
            <SignOutButton className={galleryShellNavLinkClass()} />
          </>
        ) : (
          <GalleryNavLink href="/auth/login?next=/upload" tone="shell">
            Sign in
          </GalleryNavLink>
        )}
      </nav>

      <div
        className={cn(
          gallerySans(),
          "relative z-10 flex shrink-0 items-center gap-0.5 md:hidden"
        )}
      >
        {signedIn ? (
          <SignOutButton iconOnly className={galleryShellIconButtonClass()} />
        ) : (
          <Link
            href="/auth/login?next=/upload"
            className={galleryShellIconButtonClass()}
            aria-label="Sign in"
          >
            <IconLogin className="size-4" aria-hidden />
          </Link>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={galleryShellIconButtonClass()}
              aria-label="Open navigation menu"
            >
              <IconMenu2 className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={cn(gallerySans(), "w-44")}
          >
            <DropdownMenuItem asChild>
              <a
                href="https://portal.winlab.tw"
                className="flex cursor-pointer items-center gap-2"
              >
                <IconExternalLink className="size-4 shrink-0" aria-hidden />
                Portal
              </a>
            </DropdownMenuItem>
            {signedIn && active !== "manage" ? (
              <DropdownMenuItem asChild>
                <Link
                  href="/upload"
                  className="flex cursor-pointer items-center gap-2"
                >
                  <IconPhotoEdit className="size-4 shrink-0" aria-hidden />
                  Manage
                </Link>
              </DropdownMenuItem>
            ) : null}
            {active === "manage" ? (
              <DropdownMenuItem asChild>
                <Link
                  href="/"
                  className="flex cursor-pointer items-center gap-2"
                >
                  <IconLayoutGrid className="size-4 shrink-0" aria-hidden />
                  Gallery
                </Link>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}
