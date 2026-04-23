"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import type { ApproveSigner, SignerProfile } from "@/lib/approve/types"

export function SignerProgress({
  rows,
}: {
  rows: (ApproveSigner & { profile: SignerProfile | null })[]
}) {
  return (
    <aside className="space-y-2">
      <div className="text-xs text-muted-foreground">Signers</div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-sm">
          <Avatar className="size-6">
            <AvatarImage src={r.profile?.avatar_url ?? undefined} />
            <AvatarFallback>
              {r.profile?.name?.slice(0, 1) ?? "?"}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate">
            {r.profile?.name ?? r.signer_id}
          </span>
          <span
            className={
              r.status === "signed"
                ? "text-xs text-muted-foreground"
                : "text-xs"
            }
          >
            {r.status === "signed" ? r.signed_at?.slice(0, 10) : "pending"}
          </span>
        </div>
      ))}
    </aside>
  )
}
