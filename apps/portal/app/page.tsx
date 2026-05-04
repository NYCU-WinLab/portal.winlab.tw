import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { PortalShell } from "@/components/portal-shell"
import { SignOutButton } from "@/components/sign-out-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserCard } from "@/components/user-card"
import { isReceiptsAdmin } from "@/lib/receipts/admin"
import { getCurrentUser } from "@/lib/user"

const baseApps = [
  { href: "/bento", label: "Bento", note: "便當訂購" },
  { href: "/leave", label: "Leave", note: "請假登記" },
  { href: "/meetings", label: "Meetings", note: "組會排班" },
  { href: "/approve", label: "Approve", note: "文件簽核" },
  { href: "/trip", label: "Trip", note: "出差文件" },
  { href: "/debt", label: "Debt", note: "分帳記帳" },
  { href: "/reimburse", label: "Reimburse", note: "收支記帳" },
  { href: "/profile", label: "Profile", note: "個人帳號" },
  { href: "https://gallery.winlab.tw", label: "Gallery", note: "藝術畫廊" },
]

export default async function Page() {
  const [user, showReceipts] = await Promise.all([
    getCurrentUser(),
    isReceiptsAdmin(),
  ])
  const currentUser = user!

  const apps = showReceipts
    ? [
        ...baseApps.slice(0, 7),
        { href: "/receipts", label: "Receipts", note: "收據審核" },
        ...baseApps.slice(7),
      ]
    : baseApps

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
          name={currentUser.name}
          email={currentUser.email}
          avatarUrl={currentUser.avatarUrl}
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
