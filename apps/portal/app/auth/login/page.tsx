import { redirect } from "next/navigation"

import { PortalShell } from "@/components/portal-shell"
import { SignInButton } from "@/components/sign-in-button"
import { getCurrentUser } from "@/lib/user"

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect("/")

  return (
    <PortalShell appName="Sign in">
      <div className="flex min-h-[60vh] flex-col justify-center gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium">Sign in to portal</h1>
          <p className="text-sm text-muted-foreground">
            Continue with your WinLab SSO account.
          </p>
        </div>
        <SignInButton />
      </div>
    </PortalShell>
  )
}
