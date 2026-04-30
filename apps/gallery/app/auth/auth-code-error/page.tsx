import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { PortalShell } from "@workspace/ui/components/portal-shell"

export default function AuthCodeErrorPage() {
  return (
    <PortalShell appName="Gallery" appHref="/" cornerClassName="text-lg">
      <div className="flex min-h-[60vh] flex-col justify-center gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-5xl italic md:text-6xl">Sign in failed</h1>
          <p className="text-lg text-muted-foreground md:text-xl">
            The sign-in link was invalid or expired. Try again.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </div>
    </PortalShell>
  )
}
