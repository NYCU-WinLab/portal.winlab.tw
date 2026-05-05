export interface Meeting {
  id: string
  year: number
  weekLabel: string | null
  scheduledDate: string
  isHoliday: boolean
  presenter: string | null
  presenterUserId: string | null
  pptUploaded: boolean
  pptLink: string | null
  videoUploaded: boolean
  videoLink: string | null
  paperTitle: string | null
  paperLink: string | null
  notes: string | null
  createdAt: string
}

export interface TeacherPaper {
  id: string
  providedDate: string
  paperName: string
  fileLink: string | null
  source: string | null
  createdAt: string
}

export interface DbMeeting {
  id: string
  year: number
  week_label: string | null
  scheduled_date: string
  is_holiday: boolean
  presenter: string | null
  presenter_user_id: string | null
  ppt_uploaded: boolean
  ppt_link: string | null
  video_uploaded: boolean
  video_link: string | null
  paper_title: string | null
  paper_link: string | null
  notes: string | null
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

export function toMeeting(row: DbMeeting): Meeting {
  return {
    id: row.id,
    year: row.year,
    weekLabel: row.week_label,
    scheduledDate: row.scheduled_date,
    isHoliday: row.is_holiday,
    presenter: row.presenter,
    presenterUserId: row.presenter_user_id,
    pptUploaded: row.ppt_uploaded,
    pptLink: row.ppt_link,
    videoUploaded: row.video_uploaded,
    videoLink: row.video_link,
    paperTitle: row.paper_title,
    paperLink: row.paper_link,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export function toTeacherPaper(row: DbTeacherPaper): TeacherPaper {
  return {
    id: row.id,
    providedDate: row.provided_date,
    paperName: row.paper_name,
    fileLink: row.file_link,
    source: row.source,
    createdAt: row.created_at,
  }
}
