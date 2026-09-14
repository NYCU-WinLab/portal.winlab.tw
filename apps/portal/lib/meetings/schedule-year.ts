// /meetings 開在哪一年，以及前進箭頭能走多遠。
//
// 兩個問題都從資料回答，不從時鐘。以前的 `new Date().getFullYear()` 預設值
// 會在 1 月 1 日打開一個沒有任何列的年份，而下一場會議就在左邊一格。
//
// 這個檔案曾經還要處理第二件事：meetings.year 是一個「建立時蓋一次」的 bucket，
// 和日期的年份可以不一樣。那個欄位已經不存在了——頁籤是日期年份的純函數，所以
// 這裡只剩「下一場會議在哪一年」和「最遠能到哪一年」兩個問題。

export interface ScheduleYearBounds {
  /**
   * 今天或之後最早的非假期會議日期（ISO `YYYY-MM-DD`）。
   * 假期是列但不是會議：讓一列元旦或月考週來回答「下一場會議在哪」，會把頁面
   * 送到一個沒東西可看的年份。
   */
  upcomingDate: string | null
  /** 整份排班最後一列的日期。 */
  latestDate: string | null
}

function yearOf(dateStr: string | null): number | null {
  return dateStr ? Number(dateStr.slice(0, 4)) : null
}

/**
 * URL 沒指定年份時要開哪一年：下一場會議真正所在的那一年。沒有未來的會議就
 * 退回排班最後一列所在的年份，再退回日曆年（空資料表——全新安裝）。
 */
export function defaultScheduleYear(
  bounds: ScheduleYearBounds,
  calendarYear: number
): number {
  return (
    yearOf(bounds.upcomingDate) ?? yearOf(bounds.latestDate) ?? calendarYear
  )
}

/**
 * 前進箭頭能到的最遠年份——永遠比現有資料多一年，這樣管理員才能打開一個空的
 * 明年去產生排班。沒有這個 +1，排班就永遠無法被延長到現有資料之後。
 */
export function maxNavigableYear(
  bounds: ScheduleYearBounds,
  calendarYear: number
): number {
  return Math.max(calendarYear, yearOf(bounds.latestDate) ?? calendarYear) + 1
}
