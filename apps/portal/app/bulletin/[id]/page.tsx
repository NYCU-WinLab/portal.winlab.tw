import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pin } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"

import { PortalShell } from "@/components/portal-shell"
import { createClient } from "@/lib/supabase/server"
import { toAnnouncement, type DbAnnouncement } from "@/lib/bulletin/types"

import { AnnouncementActions } from "./_components/announcement-actions"

export default async function BulletinDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data }, { data: isAdminData }] = await Promise.all([
    supabase
      .from("announcements")
      .select("*")
      .eq("id", id)
      .eq("is_published", true)
      .maybeSingle(),
    supabase.rpc("is_portal_admin"),
  ])

  if (!data) notFound()

  const a = toAnnouncement(data as DbAnnouncement)
  const isAdmin = isAdminData === true

  return (
    <PortalShell
      appName="公布欄"
      bottomLeft={
        <Link
          href="/"
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Portal
        </Link>
      }
    >
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              {a.pinned && (
                <Pin className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <h1 className="leading-snug font-medium">{a.title}</h1>
            </div>
            {isAdmin && <AnnouncementActions announcement={a} />}
          </div>
          {a.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {a.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          <time className="text-xs text-muted-foreground">
            {new Date(a.createdAt).toLocaleDateString("zh-TW", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        </header>

        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
          {a.content}
        </div>
      </article>
    </PortalShell>
  )
}
