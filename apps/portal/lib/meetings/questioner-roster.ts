import { rotationExclusionReason } from "./lab-status"
import type { QuestionPoolMember } from "./types"

/**
 * 名冊（meeting_question_pool）一人一列：報告順位名單的成員是「預設提問人」，
 * 其餘是「額外提問成員」。兩者的差別只在 isPresenter，由資料庫從報告名單推導，
 * 所以這裡不需要、也不應該再拿兩份名單做交集或聯集。
 */
export function summarizeRoster(members: QuestionPoolMember[]) {
  return {
    extras: members.filter((m) => !m.isPresenter),
    enabledCount: members.filter((m) => m.isEnabled).length,
  }
}

/**
 * 可以新增為額外提問成員的人：還不在名冊裡的實驗室成員。報告人本來就在名冊
 * 裡（預設提問人），所以扣掉名冊就同時扣掉了報告人 —— 「額外成員不得是報告人」
 * 不需要另外檢查，資料庫的 meetings_question_pool_add 也會擋。
 */
export function extraCandidates<T extends { id: string }>(
  labUsers: T[],
  members: QuestionPoolMember[]
): T[] {
  const onRoster = new Set(members.map((m) => m.userId))
  return labUsers.filter((u) => !onRoster.has(u.id))
}

/**
 * 手動替換提問人時可以選的人。與資料庫的 meetings_questioner_can_serve
 * （p_new_pick = false，也就是管理員手動指定）同一套規則的前端版本，用來
 * 過濾選單；真正的把關仍在 RPC：
 *
 * - 沒有被停用（比 RPC 嚴格：RPC 看的是當週日期是否落在停用區間，停用明天
 *   才生效，所以今天剛停用的人 RPC 其實還收；選單直接不列，免得混淆）
 * - lab_status 是碩博士，或尚未同步（尚未同步的人管理員仍可手動指定）
 * - 不是當週報告人、還不在當週名單裡
 * - 當週日期不早於他加入名冊的日期
 */
export function replacementCandidates(
  members: QuestionPoolMember[],
  week: {
    presenterUserId: string | null
    scheduledDate: string
    questionerIds: ReadonlySet<string>
  }
): QuestionPoolMember[] {
  return members.filter((m) => {
    if (!m.isEnabled) return false
    const reason = rotationExclusionReason(m.labStatus)
    if (reason !== null && reason !== "unsynced") return false
    if (m.userId === week.presenterUserId) return false
    if (week.questionerIds.has(m.userId)) return false
    return m.joinedOn <= week.scheduledDate
  })
}

/**
 * "2026-10-05" → "10/5"。YYYY-MM-DD 是日曆日期不是時間點：直接拆字串，
 * 不交給 Date —— Date 會把它當成 UTC 午夜，在格林威治以西的時區會變成前一天。
 */
export function formatMonthDay(date: string): string {
  const [, month, day] = date.split("-").map(Number)
  return `${month}/${day}`
}

export function lastAskedLabel(lastAskedDate: string | null): string {
  if (!lastAskedDate) return "從未提問"
  return `上次提問：${formatMonthDay(lastAskedDate)}`
}
