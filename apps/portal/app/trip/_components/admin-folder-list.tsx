"use client"

import { ChevronDown, ChevronRight, Download } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  useTripMemberSignatures,
  type MemberSignature,
} from "@/hooks/trip/use-sign-prefs"
import {
  useDownloadAllFiles,
  useDownloadUserFiles,
  type SignConfig,
} from "@/hooks/trip/use-trip-files"
import type { TripFileWithUser } from "@/lib/trip/types"

import { FileCard } from "./file-card"

type Folder = {
  userId: string
  userName: string
  files: TripFileWithUser[]
}

function groupByUser(files: TripFileWithUser[]): Folder[] {
  const map = new Map<string, Folder>()
  for (const f of files) {
    const userId = f.user_id ?? "unknown"
    const userName = f.user?.name ?? "未知成員"
    const existing = map.get(userId)
    if (existing) {
      existing.files.push(f)
    } else {
      map.set(userId, { userId, userName, files: [f] })
    }
  }
  return [...map.values()].sort((a, b) =>
    a.userName.localeCompare(b.userName, "zh-Hant")
  )
}

// Build a map<userId, SignConfig> from the RPC result. A user appears only if
// they have a signature AND have toggled signing on.
function buildSignMap(
  members: Map<string, MemberSignature> | undefined
): Map<string, SignConfig> {
  const out = new Map<string, SignConfig>()
  if (!members) return out
  for (const [userId, m] of members) {
    if (m.enabled && m.signature) {
      out.set(userId, { signature: m.signature, corner: m.corner })
    }
  }
  return out
}

export function AdminFolderList({
  tripId,
  tripName,
  files,
  isLoading,
  canDelete,
}: {
  tripId: string
  tripName: string
  files: TripFileWithUser[]
  isLoading: boolean
  canDelete: boolean
}) {
  const folders = useMemo(() => groupByUser(files), [files])
  const memberSigsQuery = useTripMemberSignatures(tripId)
  const signMap = useMemo(
    () => buildSignMap(memberSigsQuery.data),
    [memberSigsQuery.data]
  )
  const downloadAll = useDownloadAllFiles()

  const handleDownloadAll = async () => {
    try {
      await downloadAll.mutateAsync({ tripName, files, memberSigns: signMap })
      toast.success("壓縮完成")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "下載失敗")
    }
  }

  if (isLoading && files.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">所有成員</h2>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[60px] w-full rounded-xl" />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">所有成員</h2>
          <span className="text-xs text-muted-foreground">
            {folders.length} 人 · {files.length} 個檔案
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownloadAll}
          disabled={downloadAll.isPending || files.length === 0}
        >
          <Download className="size-4" />
          {downloadAll.isPending ? "壓縮中..." : "下載全部"}
        </Button>
      </div>
      {folders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          還沒有人上傳檔案
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {folders.map((folder) => (
            <AdminFolder
              key={folder.userId}
              folder={folder}
              tripName={tripName}
              memberSign={signMap.get(folder.userId) ?? null}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function AdminFolder({
  folder,
  tripName,
  memberSign,
  canDelete,
}: {
  folder: Folder
  tripName: string
  memberSign: SignConfig
  canDelete: boolean
}) {
  const [open, setOpen] = useState(false)
  const downloadUser = useDownloadUserFiles()

  const handleDownload = async () => {
    try {
      await downloadUser.mutateAsync({
        tripName,
        userName: folder.userName,
        files: folder.files,
        memberSign,
      })
      toast.success("壓縮完成")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "下載失敗")
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="flex-1 truncate text-sm font-medium">
            {folder.userName}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {folder.files.length} 個
          </span>
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground"
          onClick={handleDownload}
          disabled={downloadUser.isPending}
          aria-label={`下載 ${folder.userName} 的檔案`}
        >
          <Download className="size-4" />
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-3">
          {folder.files.map((file) => (
            <FileCard
              key={file.id}
              tripId={file.trip_id}
              file={file}
              sign={memberSign}
              canEdit={false}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
