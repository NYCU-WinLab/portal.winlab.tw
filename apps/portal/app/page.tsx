import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { PortalShell } from "@/components/portal-shell"
import { SignOutButton } from "@/components/sign-out-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserCard } from "@/components/user-card"
import { getCurrentUser } from "@/lib/user"

const apps = [
  { href: "/bento", label: "Bento", note: "便當訂購" },
  { href: "/leave", label: "Leave", note: "請假登記" },
  { href: "/approve", label: "Approve", note: "文件簽核" },
  { href: "/profile", label: "Profile", note: "Your account" },
]

export default async function Page() {
  const user = (await getCurrentUser())!

  return (
    <PortalShell appName="Portal" bottomLeft={<ThemeToggle />}>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">portal.winlab.tw</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back. Pick an app below.
          </p>
        </div>
        <UserCard
          name={user.name}
          email={user.email}
          avatarUrl={user.avatarUrl}
        />
        <nav className="flex flex-col gap-3">
          {apps.map((app) => (
            <Button
              key={app.href}
              asChild
              variant="outline"
              className="justify-between"
            >
              <Link href={app.href}>
                <span>{app.label}</span>
                <span className="text-xs text-muted-foreground">
                  {app.note}
                </span>
              </Link>
            </Button>
          ))}
        </nav>
        <SignOutButton />
      </div>
    </PortalShell>
  )
}
