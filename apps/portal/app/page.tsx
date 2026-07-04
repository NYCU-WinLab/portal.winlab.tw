import Link from "next/link"
import { Suspense } from "react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Toaster } from "@workspace/ui/components/sonner"

import { BulletinBoard } from "@/app/_components/bulletin-board"
import { BulletinChat } from "@/app/_components/bulletin-chat"
import { PortalShell } from "@/components/portal-shell"
import { SignOutButton } from "@/components/sign-out-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserCard } from "@/components/user-card"
import { isReceiptsAdmin } from "@/lib/receipts/admin"
import { getCurrentUser } from "@/lib/user"

const externalServices = [
  {
    href: "https://nextcloud.winlab.tw",
    label: "NextCloud",
    note: "NextCloud",
  },
  { href: "https://harbor.winlab.tw", label: "Harbor", note: "Harbor" },
  { href: "https://gitlab.winlab.tw", label: "GitLab", note: "Gitlab" },
  { href: "https://wiki.winlab.tw", label: "Wiki", note: "Wiki" },
]

function BulletinBoardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

function BulletinChatSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  )
}

const baseApps = [
  { href: "/approve", label: "Approve", note: "文件簽核" },
  { href: "/bento", label: "Bento", note: "便當訂購" },
  { href: "/debt", label: "Debt", note: "分帳記帳" },
  { href: "https://gallery.winlab.tw", label: "Gallery", note: "藝術畫廊" },
  { href: "/games", label: "Games", note: "小遊戲" },
  { href: "/leave", label: "Leave", note: "請假登記" },
  { href: "/meetings", label: "Meetings", note: "組會排班" },
  { href: "/profile", label: "Profile", note: "個人帳號" },
  { href: "/reimburse", label: "Reimburse", note: "收支記帳" },
  { href: "/trip", label: "Trip", note: "出差文件" },
]

export default async function Page() {
  const [user, showReceipts] = await Promise.all([
    getCurrentUser(),
    isReceiptsAdmin(),
  ])
  const currentUser = user!

  const apps = [
    ...baseApps,
    ...(showReceipts
      ? [{ href: "/receipts", label: "Receipts", note: "收據審核" }]
      : []),
  ].sort((a, b) => a.label.localeCompare(b.label))

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
        <Suspense fallback={<BulletinBoardSkeleton />}>
          <BulletinBoard />
        </Suspense>
        <Suspense fallback={<BulletinChatSkeleton />}>
          <BulletinChat />
        </Suspense>
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
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">WinLab 服務</p>
          {externalServices.map((svc) => (
            <Button
              key={svc.href}
              asChild
              variant="outline"
              className="justify-between"
            >
              <a href={svc.href} target="_blank" rel="noopener noreferrer">
                <span>{svc.label}</span>
                <span className="text-xs text-muted-foreground">
                  {svc.note}
                </span>
              </a>
            </Button>
          ))}
        </div>
        <SignOutButton />
      </div>
      <Toaster />
    </PortalShell>
  )
}
