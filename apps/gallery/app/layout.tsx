import type { Metadata } from "next"
import { Instrument_Serif } from "next/font/google"

import "@workspace/ui/globals.css"

import { Toaster } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"

import { AuthProvider } from "@/components/auth-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { getInitialAuthUser } from "@/lib/user"

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Gallery — WinLab",
  description: "Art from NYCU WinLab.",
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getInitialAuthUser()

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", instrumentSerif.variable)}
    >
      <body
        className={cn(
          instrumentSerif.className,
          "bg-background text-foreground"
        )}
      >
        <ThemeProvider>
          <AuthProvider initialUser={user}>{children}</AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
