"use client"

import Link from "next/link"
import {
  IconAlbum,
  IconExternalLink,
  IconHistory,
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
import type { GalleryNotification } from "@/lib/gallery/notifications"

export type GalleryShellActive = "home" | "manage" | "albums" | "memories"

export function GalleryShellNav({
  active,
  signedIn,
  viewerId = null,
  mentionNotifications = [],
  albumsAvailable = true,
  memoriesAvailable = true,
  notificationsAvailable = true,
}: {
  active: GalleryShellActive
  signedIn: boolean
  viewerId?: string | null
  mentionNotifications?: GalleryNotification[]
  albumsAvailable?: boolean
  memoriesAvailable?: boolean
  notificationsAvailable?: boolean
}) {
  return (
    <div
      className={cn(
        gallerySans(),
        "relative z-10 flex shrink-0 items-center justify-end gap-2 sm:gap-3 md:gap-4"
      )}
    >
      {signedIn && viewerId && notificationsAvailable ? (
        <GalleryMentionBell
          viewerId={viewerId}
          initialNotifications={mentionNotifications}
        />
      ) : null}

      <nav className="hidden shrink-0 items-center gap-4 md:flex">
        <GalleryNavLink href="https://portal.winlab.tw" external tone="shell">
          Portal
        </GalleryNavLink>
        {albumsAvailable ? (
          <GalleryNavLink
            href="/albums"
            active={active === "albums"}
            tone="shell"
          >
            Albums
          </GalleryNavLink>
        ) : null}
        {memoriesAvailable ? (
          <GalleryNavLink
            href="/memories"
            active={active === "memories"}
            tone="shell"
          >
            Memories
          </GalleryNavLink>
        ) : null}
        {signedIn ? (
          <>
            {active !== "manage" ? (
              <GalleryNavLink href="/upload" tone="shell">
                Hang a photo
              </GalleryNavLink>
            ) : (
              <GalleryNavLink href="/" tone="shell">
                Wall
              </GalleryNavLink>
            )}
            <SignOutButton className={galleryShellNavLinkClass()} />
          </>
        ) : (
          <GalleryNavLink href="/auth/login?next=/upload" tone="shell">
            Sign in
          </GalleryNavLink>
        )}
      </nav>

      <div className="flex shrink-0 items-center gap-0.5 md:hidden">
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
            {albumsAvailable ? (
              <DropdownMenuItem asChild>
                <Link
                  href="/albums"
                  className="flex cursor-pointer items-center gap-2"
                >
                  <IconAlbum className="size-4 shrink-0" aria-hidden />
                  Albums
                </Link>
              </DropdownMenuItem>
            ) : null}
            {memoriesAvailable ? (
              <DropdownMenuItem asChild>
                <Link
                  href="/memories"
                  className="flex cursor-pointer items-center gap-2"
                >
                  <IconHistory className="size-4 shrink-0" aria-hidden />
                  Memories
                </Link>
              </DropdownMenuItem>
            ) : null}
            {signedIn && active !== "manage" ? (
              <DropdownMenuItem asChild>
                <Link
                  href="/upload"
                  className="flex cursor-pointer items-center gap-2"
                >
                  <IconPhotoEdit className="size-4 shrink-0" aria-hidden />
                  Manage / upload
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
                  Back to wall
                </Link>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
