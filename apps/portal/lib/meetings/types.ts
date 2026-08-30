export interface Meeting {
  id: string
  year: number
  semesterId: string
  weekLabel: string | null
  scheduledDate: string
  isHoliday: boolean
  isSpeaker: boolean
  isThesis: boolean
  presenter: string | null
  presenterUserId: string | null
  pptUploaded: boolean
  pptLink: string | null
  videoUploaded: boolean
  videoLink: string | null
  paperTitle: string | null
  paperLink: string | null
  teacherPaperId: string | null
  notes: string | null
  location: string
  startTime: string
  createdAt: string
}

export interface Tag {
  id: string
  name: string
  color: string | null
  createdAt: string
}

export interface TeacherPaper {
  id: string
  providedDate: string
  paperName: string
  fileLink: string | null
  source: string | null
  createdAt: string
  tags: Tag[]
}

export interface QuestionPoolMember {
  userId: string
  name: string | null
  email: string | null
  poolAddedAt: string
  lastAskedDate: string | null
  timesAsked: number
}

export interface PresenterPoolMember {
  userId: string
  admissionYear: number
  sortOrder: number
  name: string | null
  email: string | null
  poolAddedAt: string
  lastPresentedDate: string | null
  timesPresented: number
  labStatus: string | null
  tierRank: number
}

export interface MeetingQuestioner {
  meetingId: string
  userId: string
  name: string | null
  source: "auto" | "manual"
}

/**
 * The unit `第N週` numbering restarts on.
 *
 * N is the Nth **calendar** week of the semester, not the Nth week the lab
 * actually met: a holiday week occupies its number (the generate RPC writes
 * `第N週(原因)`), and it keeps that number even if an admin later rewrites the
 * label by hand (`大掃除`). Numbers are therefore only ever minted forward, as
 * `max(第N) + 1` over the whole semester — nothing renumbers a semester
 * automatically, on the client or in a migration. A positional re-derivation
 * from "the weeks that look like `第N週`" would pull every week after a
 * hand-relabelled holiday down by one.
 */
export interface Semester {
  id: string
  academicYear: number
  term: 1 | 2
  startDate: string
  plannedWeeks: number | null
}

export interface DbMeeting {
  id: string
  year: number
  semester_id: string
  week_label: string | null
  scheduled_date: string
  is_holiday: boolean
  is_speaker: boolean
  is_thesis: boolean
  presenter: string | null
  presenter_user_id: string | null
  ppt_uploaded: boolean
  ppt_link: string | null
  video_uploaded: boolean
  video_link: string | null
  paper_title: string | null
  paper_link: string | null
  teacher_paper_id: string | null
  notes: string | null
  location: string
  start_time: string
  created_at: string
}

export interface DbSemester {
  id: string
  academic_year: number
  term: number
  start_date: string
  planned_weeks: number | null
}

export interface DbTeacherPaper {
  id: string
  provided_date: string
  paper_name: string
  file_link: string | null
  source: string | null
  created_at: string
}

export interface DbTag {
  id: string
  name: string
  color: string | null
  created_at: string
}

export interface DbQuestionPoolMember {
  user_id: string
  name: string | null
  email: string | null
  pool_added_at: string
  last_asked_date: string | null
  times_asked: number
}

export interface DbPresenterPoolMember {
  user_id: string
  admission_year: number
  sort_order: number
  name: string | null
  email: string | null
  pool_added_at: string
  last_presented_date: string | null
  times_presented: number
  lab_status: string | null
  tier_rank: number
}

export function toPresenterPoolMember(
  row: DbPresenterPoolMember
): PresenterPoolMember {
  return {
    userId: row.user_id,
    admissionYear: row.admission_year,
    sortOrder: row.sort_order,
    name: row.name,
    email: row.email,
    poolAddedAt: row.pool_added_at,
    lastPresentedDate: row.last_presented_date,
    timesPresented: row.times_presented,
    labStatus: row.lab_status,
    tierRank: row.tier_rank,
  }
}

export function toMeeting(row: DbMeeting): Meeting {
  return {
    id: row.id,
    year: row.year,
    semesterId: row.semester_id,
    weekLabel: row.week_label,
    scheduledDate: row.scheduled_date,
    isHoliday: row.is_holiday,
    isSpeaker: row.is_speaker,
    isThesis: row.is_thesis,
    presenter: row.presenter,
    presenterUserId: row.presenter_user_id,
    pptUploaded: row.ppt_uploaded,
    pptLink: row.ppt_link,
    videoUploaded: row.video_uploaded,
    videoLink: row.video_link,
    paperTitle: row.paper_title,
    paperLink: row.paper_link,
    teacherPaperId: row.teacher_paper_id,
    notes: row.notes,
    location: row.location,
    startTime: row.start_time,
    createdAt: row.created_at,
  }
}

export function toSemester(row: DbSemester): Semester {
  return {
    id: row.id,
    academicYear: row.academic_year,
    term: row.term === 1 ? 1 : 2,
    startDate: row.start_date,
    plannedWeeks: row.planned_weeks,
  }
}

/**
 * Derived from academicYear/term only — start_date and planned_weeks are
 * informational metadata and must never drive display text (a
 * trigger-created semester's start_date is incidental, not authoritative).
 */
export function semesterLabel(s: Semester): string {
  return `${s.academicYear} ${s.term === 1 ? "上" : "下"}學期`
}

export function toTag(row: DbTag): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  }
}

export function toTeacherPaper(
  row: DbTeacherPaper,
  tags: Tag[] = []
): TeacherPaper {
  return {
    id: row.id,
    providedDate: row.provided_date,
    paperName: row.paper_name,
    fileLink: row.file_link,
    source: row.source,
    createdAt: row.created_at,
    tags,
  }
}

export function toQuestionPoolMember(
  row: DbQuestionPoolMember
): QuestionPoolMember {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    poolAddedAt: row.pool_added_at,
    lastAskedDate: row.last_asked_date,
    timesAsked: row.times_asked,
  }
}
