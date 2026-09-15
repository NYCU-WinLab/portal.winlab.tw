import { parseLabStatus, type LabStatus } from "@/lib/meetings/lab-status"
import type { SemesterKey } from "@/lib/meetings/semester"

export interface Meeting {
  id: string
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
  /** 只算已發生的場次；已排定但尚未到的在 timesAskedScheduled。 */
  lastAskedDate: string | null
  timesAsked: number
  timesAskedScheduled: number
  opportunities: number
  /**
   * (已提問 + 已排定) / 加入後的機會數。輪替就是照這個值由小到大挑人，
   * 所以面板的排序必須跟它一致，否則畫面上的「下一位」會跟實際排出來的人不同。
   */
  rate: number
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
  labStatus: LabStatus | null
  tierRank: number
  timesPresentedScheduled: number
}

export interface MeetingQuestioner {
  meetingId: string
  userId: string
  name: string | null
  source: "auto" | "manual"
}

export interface DbMeeting {
  id: string
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
  times_asked_scheduled: number
  opportunities: number
  rate: number
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
  times_presented_scheduled: number
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
    labStatus: parseLabStatus(row.lab_status),
    tierRank: row.tier_rank,
    timesPresentedScheduled: row.times_presented_scheduled,
  }
}

export function toMeeting(row: DbMeeting): Meeting {
  return {
    id: row.id,
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

/**
 * 從學年度與學期推導，這是它現在僅有的兩個輸入。學期不再是一列資料，所以
 * 也不再有 start_date / planned_weeks 這種會誤導顯示文字的欄位。
 */
export function semesterLabel(key: SemesterKey): string {
  return `${key.academicYear} ${key.term === 1 ? "上" : "下"}學期`
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
    timesAskedScheduled: row.times_asked_scheduled,
    opportunities: row.opportunities,
    rate: row.rate,
  }
}

export interface RebalanceWeek {
  meetingId: string
  date: string
  questioners: string[]
}

export interface RebalanceResult {
  dryRun: boolean
  /** 被保留不動的那一場（最近一次尚未發生的會議）。沒有未來會議時為 null。 */
  frozenDate: string | null
  weeks: number
  assigned: number
  roster: RebalanceWeek[]
}
