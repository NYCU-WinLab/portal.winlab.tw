// 入學學年 (admission year) as it travels between Keycloak and the portal.
//
// Keycloak stores it as a zero-padded three-character string — the winlab
// realm validates `admissionYear` against ^(0(9[0-9])|1([0-8][0-9]|9[0-9]))$,
// so 民國 95 is "095" and a bare "95" is rejected on write. We keep an integer
// internally (the presenter pool column is `integer`) and convert at the edge.
//
// Values are 民國 (ROC) years, never 西元. Converting a 西元 year would be
// guessing at intent, and the realm would reject the result anyway, so a
// four-digit input is treated as an error the caller should surface.

/** Widest range the realm's own pattern accepts: 民國 90–199. */
const MIN_YEAR = 90
const MAX_YEAR = 199

export function parseAdmissionYear(
  raw: string | null | undefined
): number | null {
  const text = (raw ?? "").trim()
  if (!/^\d{2,3}$/.test(text)) return null
  const year = Number(text)
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null
}

/** The wire format Keycloak requires. */
export function formatAdmissionYear(year: number): string {
  return String(year).padStart(3, "0")
}

/** How a cohort is labelled in the UI. */
export function admissionYearLabel(year: number): string {
  return `${year} 級`
}

// Student IDs encode the admission year, which is how the roster got seeded
// for members whose admissionYear attribute was never filled in:
//   9 digits  [class 1][year 2][dept 3][serial 3]
//   7 digits  [year 2][...]  — the pre-110 format
// A two-digit head below 20 means 民國 10x, e.g. "05" in 0556184 is 105.
export function admissionYearFromStudentId(
  studentId: string | null | undefined
): number | null {
  const text = (studentId ?? "").trim()
  if (!/^\d+$/.test(text)) return null

  let head: number
  if (text.length === 9) head = Number(text.slice(1, 3))
  else if (text.length === 7) head = Number(text.slice(0, 2))
  else return null

  const year = head < 20 ? head + 100 : head
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null
}

// 學制的中文字首。teacher / assistant / alumni 刻意不在表內：他們沒有年級。
const TIER_PREFIX: Record<string, string> = {
  doctoral: "博",
  master: "碩",
  undergrad: "大",
}

const GRADE_NUMERAL = ["一", "二", "三", "四", "五", "六", "七", "八"]

/**
 * `碩二` — 學制加上「入學後第幾年」。純顯示用。
 *
 * 排序不需要這個：報告順位的層內順序是 admission_year 升冪，那本身就是年級由高
 * 到低，博士班也一樣。這裡只是把兩個數字翻成人看得懂的標籤。
 *
 * academicYear 與 admissionYear 都是民國年。超出 1..8 一律回 null —— 入學年比
 * 學年度還晚代表資料有問題，編一個名字出來只會掩蓋它。academicYear 允許 null
 * ——呼叫端（目前學期尚未載入完成，或資料庫還沒有任何學期列）可能還沒有答案，
 * 讓這個函式自己吞掉 null 而不是要求呼叫端用 `&&`/`??` 兜，那種寫法在
 * academicYear 是 null 時會短路成 `false`，而 `false ?? fallback` 仍是
 * `false`——react 把它渲染成空白，讓後備標籤永遠跑不到。
 */
export function tierGradeLabel(
  labStatus: string | null,
  academicYear: number | null,
  admissionYear: number
): string | null {
  if (academicYear === null) return null
  const prefix = labStatus ? TIER_PREFIX[labStatus] : undefined
  if (!prefix) return null
  const grade = academicYear - admissionYear + 1
  if (grade < 1 || grade > GRADE_NUMERAL.length) return null
  return `${prefix}${GRADE_NUMERAL[grade - 1]}`
}
