import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { PortalShell } from "@/components/portal-shell"

export default function AuthCodeErrorPage() {
  return (
    <PortalShell appName="Sign in">
      <div className="flex min-h-[60vh] flex-col justify-center gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium">Sign in failed</h1>
          <p className="text-sm text-muted-foreground">
            The sign-in link was invalid or expired. Give it another go.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </div>
    </PortalShell>
  )
}
