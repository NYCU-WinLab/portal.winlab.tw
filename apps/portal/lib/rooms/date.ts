// Small date helpers scoped to the room-availability feature — kept local
// rather than reusing lib/meetings/papers.ts's addDays to avoid coupling two
// unrelated features together.

const MS_PER_DAY = 86_400_000

/** Today as a YYYY-MM-DD Asia/Taipei calendar day. */
export function todayInTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** `dateStr` shifted by `n` days, back as a YYYY-MM-DD string. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00+08:00`)
  const shifted = new Date(d.getTime() + n * MS_PER_DAY)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted)
}

/** `dateStr` (YYYY-MM-DD) as "MM/DD（週X）" in Asia/Taipei. */
export function formatDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+08:00`)
  const md = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
  const weekday = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    weekday: "short",
  }).format(d)
  return `${md}（${weekday}）`
}
