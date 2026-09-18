import { rotationExclusionReason } from "@/lib/meetings/lab-status"

/**
 * Why a member is greyed out. Three reasons, not one, because the automation
 * treats them differently — see rotationExclusionReason.
 */
const EXCLUSION_HINT = {
  unsynced:
    "尚未從 Keycloak 同步到身分：不會被排入新的報告或提問，已排定的不受影響，管理員仍可手動指定",
  alumni: "已畢業：不會被排入新的報告或提問，已排定的提問會自動換人",
  "not-graduate":
    "提問輪替只包含碩士生與博士生：不會被排入新的報告或提問，已排定的提問會自動換人",
} as const

/** Greys out a member the automation will not schedule, and says why. */
export function NotScheduledBadge({ labStatus }: { labStatus: string | null }) {
  const reason = rotationExclusionReason(labStatus)
  if (!reason) return null
  return (
    <span
      className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
      title={EXCLUSION_HINT[reason]}
    >
      未排程
    </span>
  )
}
