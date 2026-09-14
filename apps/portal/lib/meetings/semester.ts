// 哪個日期屬於哪個學期 —— SQL 端 public.meeting_academic_year /
// public.meeting_term / public.meeting_semester_start / meeting_semester_end
// 的鏡像（supabase/migrations/20260914151549_meetings_derive_schedule_from_date.sql）。
//
// KEEP THE TWO IN SYNC。界線是寫死的規則，不是存起來的資料：學期不再是一張
// 表，`meetings` 也不再有 semester_id，所以兩邊都只是同一條規則的實作，沒有
// 一邊是「權威」。改動任何一邊都必須同時改另一邊，並更新兩邊的邊界測試。
//
// ROC 學年度，8 月為界：教學從 9 月開始，所以 8 月起屬於正要開始的那個學年度，
// 而 1 月——上學期的尾巴——仍屬於前一年。

export interface SemesterKey {
  /** ROC academic year, e.g. 114. */
  academicYear: number
  /** 1 = 上學期 (months 8–12 and 1), 2 = 下學期 (months 2–7). */
  term: 1 | 2
}

/**
 * `dateStr` is an ISO `YYYY-MM-DD`. Parsed by splitting the string rather than
 * through `new Date()`, which reads a bare date as UTC midnight and lands on the
 * previous day west of UTC — a one-day shift is enough to flip the term on
 * 1 August or 1 February.
 */
export function semesterKeyForDate(dateStr: string): SemesterKey {
  const [y, m] = dateStr.split("-")
  const year = Number(y)
  const month = Number(m)

  const academicYear = year - 1911 - (month < 8 ? 1 : 0)
  const term = month >= 8 || month === 1 ? 1 : 2
  return { academicYear, term }
}

/**
 * 該日期所屬學期的日期窗，**兩端皆含**。SQL 端
 * `meeting_semester_start` / `meeting_semester_end` 的鏡像——兩邊必須同步。
 *
 * 界線寫死：上學期 8/1 – 隔年 1/31，下學期 2/1 – 7/31。和
 * `semesterKeyForDate` 一樣用切字串而不是 `new Date()`：後者把裸日期讀成
 * UTC 午夜，在 UTC 以西會退一天，而一天的位移就足以在 8/1 或 2/1 翻學期。
 */
export function semesterWindow(dateStr: string): {
  start: string
  end: string
} {
  const [y, m] = dateStr.split("-")
  const year = Number(y)
  const month = Number(m)

  if (month >= 8) return { start: `${year}-08-01`, end: `${year + 1}-01-31` }
  if (month === 1) return { start: `${year - 1}-08-01`, end: `${year}-01-31` }
  return { start: `${year}-02-01`, end: `${year}-07-31` }
}

/**
 * 報告順位名單的年級標籤（`碩二`…）該用哪個學年度計算——就是今天所在的學年度。
 *
 * 以前這個函式要吃一份 semesters 清單，因為學期是資料表，而
 * `semesters.at(-1)` 會在管理員提前幾個月建好下學期時回報未來的學年度。
 * 學期改成從日期推導之後，這個歧義消失了：今天在哪個學年度就是哪個。
 *
 * `today` 必須是已經換算到 Asia/Taipei 的 `YYYY-MM-DD` 字串——這個函式不自己
 * 讀時鐘，好讓它保持純函式，由呼叫端決定何時取樣「現在」。
 */
export function currentAcademicYear(today: string): number {
  return semesterKeyForDate(today).academicYear
}
