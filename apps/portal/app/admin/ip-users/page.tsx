import type { Metadata } from "next"
import { redirect } from "next/navigation"

import {
  IpUserAccessError,
  requireIpUserAdmin,
} from "@/lib/admin/ip-users-server"
import type { IpUserCategory } from "@/lib/admin/ip-users"

import { IpUserTable } from "./_components/ip-user-table"

export const metadata: Metadata = { title: "IP USER | Admin | Portal" }

export default async function IpUsersPage() {
  const supabase = await requireIpUserAdmin().catch((error: unknown) => {
    if (error instanceof IpUserAccessError) redirect("/")
    throw error
  })
  const [settingsResult, entriesResult] = await Promise.all([
    supabase
      .from("ip_user_settings")
      .select("subnet,gateway,dns_servers,source_updated_on")
      .eq("id", true)
      .maybeSingle(),
    supabase
      .from("ip_user_entries")
      .select("id,ip,user_name,category,notes,revision,updated_at")
      .order("ip"),
  ])
  if (settingsResult.error || entriesResult.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        IP USER 載入失敗，請稍後重新整理。
      </p>
    )
  }
  const settings = settingsResult.data
  return (
    <IpUserTable
      settings={
        settings
          ? {
              subnet: String(settings.subnet),
              gateway: String(settings.gateway).split("/")[0]!,
              dns_servers: settings.dns_servers.map(
                (ip) => String(ip).split("/")[0]!
              ),
              source_updated_on: settings.source_updated_on,
            }
          : null
      }
      entries={(entriesResult.data ?? []).map((row) => ({
        ...row,
        ip: String(row.ip).split("/")[0]!,
        category: row.category as IpUserCategory,
      }))}
    />
  )
}
