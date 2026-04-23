import { redirect } from "next/navigation"

import { PortalShell } from "@/components/portal-shell"
import { SignInButton } from "@/components/sign-in-button"
import { getCurrentUser } from "@/lib/user"

type LoginPageProps = {
  searchParams: Promise<{ stale?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser()
  if (user) redirect("/")

  const { stale } = await searchParams

  return (
    <PortalShell appName="Sign in">
      <div className="flex min-h-[60vh] flex-col justify-center gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium">Sign in to portal</h1>
          <p className="text-sm text-muted-foreground">
            Continue with your WinLab SSO account.
          </p>
          {stale === "1" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Cleared a leftover session from the previous portal. Try signing
              in again.
            </p>
          ) : null}
        </div>
        <SignInButton />
      </div>
    </PortalShell>
  )
}
