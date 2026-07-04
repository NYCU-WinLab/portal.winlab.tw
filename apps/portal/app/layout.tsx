import { trace } from "@opentelemetry/api"
import { Geist, Geist_Mono } from "next/font/google"
import { headers } from "next/headers"

import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"

import { AuthProvider } from "@/components/auth-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { getInitialAuthUser } from "@/lib/user"
import { getClientAttributionAttributes } from "@/lib/otel/attribution"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getInitialAuthUser()

  // Client attribution for Sensorium: proxy.ts can't see the exported
  // request span on Vercel (it runs in the Edge sandbox, isolated from the
  // Node.js OTel context instrumentation.ts registers — see
  // lib/otel/attribution.ts's docstring for the fixed attribute-key
  // contract). This root layout already reads cookies via
  // getInitialAuthUser() above, so it's a Node.js Server Component that
  // re-renders on every request — trace.getActiveSpan() here is the same
  // span Sensorium receives, no SSG/ISR caveat to worry about.
  trace
    .getActiveSpan()
    ?.setAttributes(getClientAttributionAttributes(await headers()))

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        "font-mono",
        geistMono.variable
      )}
    >
      <body>
        <ThemeProvider>
          <AuthProvider initialUser={user}>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
