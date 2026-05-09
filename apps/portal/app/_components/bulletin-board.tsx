import Link from "next/link"
import { Pin } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"

import { createClient } from "@/lib/supabase/server"
import { toAnnouncement, type DbAnnouncement } from "@/lib/bulletin/types"

import { BulletinAdminBar } from "./bulletin-admin-bar"

async function fetchAnnouncements() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10)
  return (data ?? []).map((r) => toAnnouncement(r as DbAnnouncement))
}

async function checkIsAdmin() {
  const supabase = await createClient()
  const { data } = await supabase.rpc("is_portal_admin")
  return data === true
}

export async function BulletinBoard() {
  const [announcements, isAdmin] = await Promise.all([
    fetchAnnouncements(),
    checkIsAdmin(),
  ])

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">公布欄</p>
        {isAdmin && <BulletinAdminBar />}
      </div>

      {announcements.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          目前沒有公告
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-xl border border-border">
          {announcements.map((a) => (
            <Link
              key={a.id}
              href={`/bulletin/${a.id}`}
              className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              {a.pinned && (
                <Pin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-medium group-hover:underline">
                  {a.title}
                </span>
                {a.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="px-1.5 py-0 text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(a.createdAt).toLocaleDateString("zh-TW", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
