"use client"

import { useState } from "react"

import { IconArrowsExchange, IconRefresh } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import {
  useQuestionersByYear,
  useReplaceQuestioner,
  useSyncQuestioners,
} from "@/hooks/meetings/use-questioners"
import { useQuestionPool } from "@/hooks/meetings/use-question-pool"
import type { QuestionPoolMember } from "@/lib/meetings/types"

interface Props {
  meetingId: string
  year: number
}

function SwapMenu({
  meetingId,
  removeUserId,
  eligible,
}: {
  meetingId: string
  removeUserId: string
  eligible: QuestionPoolMember[]
}) {
  const [open, setOpen] = useState(false)
  const replaceQuestioner = useReplaceQuestioner()

  const [suggested, ...rest] = eligible

  function swap(replacementUserId?: string) {
    replaceQuestioner.mutate(
      replacementUserId
        ? { meetingId, removeUserId, replacementUserId }
        : { meetingId, removeUserId },
      { onSuccess: () => setOpen(false) }
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
        >
          <IconArrowsExchange className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="flex flex-col">
          {suggested && (
            <button
              type="button"
              disabled={replaceQuestioner.isPending}
              className="rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
              onClick={() => swap()}
            >
              系統建議（{suggested.name ?? "—"}）
            </button>
          )}
          {rest.map((c) => (
            <button
              key={c.userId}
              type="button"
              disabled={replaceQuestioner.isPending}
              className="rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
              onClick={() => swap(c.userId)}
            >
              {c.name ?? "—"}
            </button>
          ))}
          {eligible.length === 0 && (
            <span className="px-2 py-1.5 text-xs text-muted-foreground">
              候選人不足
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function QuestionersField({ meetingId, year }: Props) {
  const { data: questionersByMeeting } = useQuestionersByYear(year)
  const { data: pool = [] } = useQuestionPool()
  const syncQuestioners = useSyncQuestioners()

  const questioners = questionersByMeeting?.get(meetingId) ?? []
  const questionerIds = new Set(questioners.map((q) => q.userId))
  const eligible = pool.filter((c) => !questionerIds.has(c.userId))

  return (
    <div className="flex flex-col gap-1.5">
      <Label>提問小組</Label>

      {questioners.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          尚無提問小組成員（儲存報告人後自動排定）
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {questioners.map((q) => (
            <div
              key={q.userId}
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
            >
              <span>{q.name ?? "—"}</span>
              <SwapMenu
                meetingId={meetingId}
                removeUserId={q.userId}
                eligible={eligible}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          提問人由系統依公平輪替自動排定
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs text-muted-foreground"
          disabled={syncQuestioners.isPending}
          onClick={() => syncQuestioners.mutate(meetingId)}
        >
          <IconRefresh className="h-3 w-3" />
          重新同步
        </Button>
      </div>
    </div>
  )
}
