import Link from "next/link"

import { Card, CardContent } from "@workspace/ui/components/card"

import { GroupsPanel } from "./groups-panel"

const INFO = [
  { label: "地點", value: "EC 411" },
  { label: "時間", value: "週一 15:30" },
  {
    label: "Teams 會議",
    value: "加入 Teams",
    href: "https://teams.microsoft.com/l/meetup-join/19%3a0eE-F8b_ZBT4pEFklcMFAb-FXifnhr8CwNbE9DqvoG41%40thread.tacv2/1756957803239?context=%7b%22Tid%22%3a%2280a9abdb-7cef-443c-b040-3f8e75e9232e%22%2c%22Oid%22%3a%224e8f59ac-4563-478f-8c6f-37aadcb5f927%22%7d",
  },
  {
    label: "NextCloud",
    value: "開啟 NextCloud",
    href: "https://nextcloud.winlab.tw/apps/files/files/318788?dir=/winlab/Meeting/2026",
  },
  {
    label: "請假系統",
    value: "前往請假",
    href: "https://portal.winlab.tw/leave",
  },
  {
    label: "便當系統",
    value: "訂便當",
    href: "https://portal.winlab.tw/bento",
  },
]

export function InfoTab({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {INFO.map((item) => (
          <Card key={item.label}>
            <CardContent className="flex items-center justify-between py-4">
              <span className="text-sm text-muted-foreground">
                {item.label}
              </span>
              {item.href ? (
                <Link
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-foreground"
                >
                  {item.value}
                </Link>
              ) : (
                <span className="text-sm font-medium">{item.value}</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <GroupsPanel isAdmin={isAdmin} />
    </div>
  )
}
