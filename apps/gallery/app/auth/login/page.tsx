import { redirect } from "next/navigation"

import { PortalShell } from "@workspace/ui/components/portal-shell"

import { SignInButton } from "@/components/sign-in-button"
import { getCurrentUser } from "@/lib/user"

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser()
  const { next } = await searchParams
  const safeNext = next && next.startsWith("/") ? next : "/"
  if (user) redirect(safeNext)

  return (
    <PortalShell appName="Gallery" appHref="/" cornerClassName="text-lg">
      <div className="flex min-h-[60vh] flex-col justify-center gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-5xl italic md:text-6xl">Sign in</h1>
          <p className="text-lg text-muted-foreground md:text-xl">
            Continue with your WinLab SSO account.
          </p>
        </div>
        <SignInButton next={safeNext} />
      </div>
    </PortalShell>
  )
}
