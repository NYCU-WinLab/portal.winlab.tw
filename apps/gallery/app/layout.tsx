import type { Metadata } from "next"
import { Geist, Instrument_Serif } from "next/font/google"

import "@workspace/ui/globals.css"
import "./gallery.css"

import { Toaster } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"

import { KonamiWinlabLogo } from "@/app/_components/konami-winlab-logo"
import { getGallerySeasonalThemeId } from "@/lib/gallery/settings"
import { createClient } from "@/lib/supabase/server"

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
})

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-caption",
})

export const metadata: Metadata = {
  title: "Gallery — WinLab",
  description: "Art from NYCU WinLab.",
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const seasonalThemeId = await getGallerySeasonalThemeId(supabase)

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-gallery-theme={seasonalThemeId ?? undefined}
      className={cn(
        "antialiased",
        instrumentSerif.variable,
        geistSans.variable
      )}
    >
      <body
        data-gallery-theme={seasonalThemeId ?? undefined}
        className={cn(
          instrumentSerif.className,
          "overflow-x-hidden bg-background text-foreground"
        )}
      >
        {children}
        <KonamiWinlabLogo />
        <Toaster />
      </body>
    </html>
  )
}
