// The three schedule row kinds, derived from two mutually-exclusive booleans
// (is_holiday / is_speaker). Single source of truth for the 3-way type used by
// the add- and edit-meeting dialogs, so the "which flag means what" logic lives
// in one place. (The inline edit row branches on the raw flags directly, since
// it only needs the anchored / not-anchored distinction.)

export type MeetingType = "presentation" | "speaker" | "holiday"

export function meetingType(m: {
  isHoliday: boolean
  isSpeaker: boolean
}): MeetingType {
  if (m.isHoliday) return "holiday"
  if (m.isSpeaker) return "speaker"
  return "presentation"
}

export function typeFlags(t: MeetingType): {
  isHoliday: boolean
  isSpeaker: boolean
} {
  return { isHoliday: t === "holiday", isSpeaker: t === "speaker" }
}

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  presentation: "報告",
  speaker: "演講",
  holiday: "假日",
}
