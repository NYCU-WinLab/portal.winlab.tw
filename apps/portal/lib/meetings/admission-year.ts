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
