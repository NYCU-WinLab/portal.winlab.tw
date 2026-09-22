import type { Metadata, Viewport } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"
import { createClient } from "@/lib/supabase/server"

import "./door.css"

// /door is installable on its own: "Add to Home Screen" gives a full-screen
// door button with no browser chrome. Only this segment declares a manifest —
// portal as a whole isn't a PWA, and the other apps have no reason to be one.
//
// The manifest's `scope` is "/" even though the app is /door, and that is
// deliberate — do not narrow it to "/door". An installed web app on iOS gets
// its own cookie jar, and the first launch always lands on /auth/login, which
// is outside /door. iOS opens an out-of-scope navigation in Safari, so the
// session cookie would be written to Safari's jar while the installed app
// stays logged out — a sign-in loop with no way out. Scope "/" keeps the
// Keycloak round trip inside the installed app. The visible cost is that the
// bottom-left "Portal" link stays in the app instead of opening Safari.
export const metadata: Metadata = {
  title: "Door | Portal",
  description: "實驗室門禁開關。",
  applicationName: "Door",
  manifest: "/door/manifest.webmanifest",
  icons: {
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  // What actually makes iOS launch this standalone; the manifest alone is not
  // enough there. `title` is the name pre-filled on the Add to Home Screen
  // sheet, so it stays short rather than "Door | Portal".
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Door",
  },
  formatDetection: { telephone: false },
}

// Matches --background in packages/ui globals.css (oklch(1 0 0) /
// oklch(0.145 0 0)) so the status bar never seams against the door panel.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

// The top-right corner links to card management and the audit log, and only
// for door admins: both pages 404 for everyone else, so showing the links
// would be a dead end. Portal super admins satisfy is_door_admin() too.
export default async function DoorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc("is_door_admin")

  return (
    <>
      <PortalShell
        appName="Door"
        appHref="/"
        containerClassName="p-0"
        topRight={
          isAdmin ? (
            <span className="flex gap-4">
              <Link
                href="/door/admin"
                className="transition-colors hover:text-foreground"
              >
                Admin
              </Link>
              <Link
                href="/door/log"
                className="transition-colors hover:text-foreground"
              >
                Log
              </Link>
            </span>
          ) : undefined
        }
      >
        {children}
      </PortalShell>
      <Toaster />
    </>
  )
}
