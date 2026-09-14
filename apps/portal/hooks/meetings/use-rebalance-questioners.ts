"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type { RebalanceResult } from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

/**
 * 重新平衡未來場次的提問人。
 *
 * 兩個 mutation 打同一支 RPC，差別只在 p_dry_run —— 預覽先跑一次拿結果給人看，
 * 確認後再跑一次真的寫入。RPC 是冪等的，所以第二次跑出來的分配與預覽一致，
 * 除非中間有人改了排程或成員池。
 *
 * 預覽刻意不吐 toast：它是使用者主動要的資訊，不是背景事件，畫面上會直接
 * 列出每一週的名單。
 */
export function useRebalanceQuestioners() {
  const supabase = createClient()
  const qc = useQueryClient()

  const run = async (dryRun: boolean): Promise<RebalanceResult> => {
    const { data, error } = await supabase.rpc(
      "meetings_rebalance_questioners",
      { p_dry_run: dryRun }
    )
    if (error) throw new Error(error.message || "重新平衡提問人失敗")
    return data as unknown as RebalanceResult
  }

  const preview = useMutation({
    mutationFn: () => run(true),
    onError: (e: Error) => toast.error(e.message),
  })

  const apply = useMutation({
    mutationFn: () => run(false),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.questioners.all })
      qc.invalidateQueries({ queryKey: queryKeys.questionPool.all })
      qc.invalidateQueries({ queryKey: queryKeys.questionPool.members })
      toast.success(
        `已重新平衡 ${result.weeks} 週、${result.assigned} 個提問名額`
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return { preview, apply }
}
