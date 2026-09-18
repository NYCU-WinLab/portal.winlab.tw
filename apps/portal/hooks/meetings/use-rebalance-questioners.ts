"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type { RebalanceResult } from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

/**
 * 完整重排未來場次的提問人 —— 忽略現有安排，只保留最近一場與手動指定。
 *
 * 平常用不到：排班或名冊有任何變動時，資料庫會在 commit 時自動做最小調整。
 * 這是給「想從頭排一次」用的逃生口。
 *
 * 兩個 mutation 打同一支 RPC，差別只在 p_dry_run —— 預覽先跑一次拿結果給人看，
 * 確認後再跑一次真的寫入。RPC 是冪等的，所以第二次跑出來的分配與預覽一致，
 * 除非中間有人改了排程或名冊。
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
    if (error) throw new Error(error.message || "完整重排提問人失敗")
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
      toast.success(
        result.added + result.removed > 0
          ? `已完整重排 ${result.weeks} 週：新增 ${result.added}、移除 ${result.removed} 個提問名額`
          : "已完整重排，名單沒有變動"
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return { preview, apply }
}
