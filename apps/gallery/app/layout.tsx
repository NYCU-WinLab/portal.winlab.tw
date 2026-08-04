import { trace } from "@opentelemetry/api"
import type { Metadata, Viewport } from "next"
import { Geist, Instrument_Serif } from "next/font/google"
import { headers } from "next/headers"

import "@workspace/ui/globals.css"
import "./gallery.css"

import { Toaster } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"

import { GalleryInstallPrompt } from "@/app/_components/gallery-install-prompt"
import { GalleryOfflineBanner } from "@/app/_components/gallery-offline-banner"
import { GalleryServiceWorker } from "@/app/_components/gallery-service-worker"
import { KonamiWinlabLogo } from "@/app/_components/konami-winlab-logo"
import { ThemeProvider } from "@/components/theme-provider"
import { getGallerySeasonalThemeId } from "@/lib/gallery/settings"
import { getClientAttributionAttributes } from "@/lib/otel/attribution"
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
  applicationName: "Gallery",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gallery",
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  // Gallery is light-only — cool zinc paper, never dark chrome.
  themeColor: "#f4f4f5",
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const seasonalThemeId = await getGallerySeasonalThemeId(supabase)

  // Client attribution for Sensorium: proxy.ts can't see the exported
  // request span on Vercel (it runs in the Edge sandbox, isolated from the
  // Node.js OTel context instrumentation.ts registers — see
  // lib/otel/attribution.ts's docstring for the fixed attribute-key
  // contract). This root layout already reads cookies via createClient()
  // above, so it's a Node.js Server Component that re-renders on every
  // request — trace.getActiveSpan() here is the same span Sensorium
  // receives, no SSG/ISR caveat to worry about.
  trace
    .getActiveSpan()
    ?.setAttributes(getClientAttributionAttributes(await headers()))

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
        <ThemeProvider>
          {children}
          <GalleryServiceWorker />
          <GalleryOfflineBanner />
          <GalleryInstallPrompt />
          <KonamiWinlabLogo />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
