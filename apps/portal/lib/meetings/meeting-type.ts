// The four schedule row kinds, derived from three mutually-exclusive booleans
// (is_holiday / is_speaker / is_thesis). Single source of truth for the 4-way
// type used by the add- and edit-meeting dialogs, so the "which flag means what"
// logic lives in one place. (The inline edit row branches on the raw flags
// directly, since it only needs the anchored / not-anchored distinction.)
//
// "thesis" is a presentation week whose paper is the presenter's own master's
// thesis, so its title is typed rather than picked from the teacher's reading
// list. Only an admin can set the flag; see the meetings_guard_columns trigger.

export type MeetingType = "presentation" | "speaker" | "thesis" | "holiday"

export function meetingType(m: {
  isHoliday: boolean
  isSpeaker: boolean
  isThesis: boolean
}): MeetingType {
  if (m.isHoliday) return "holiday"
  if (m.isSpeaker) return "speaker"
  if (m.isThesis) return "thesis"
  return "presentation"
}

export function typeFlags(t: MeetingType): {
  isHoliday: boolean
  isSpeaker: boolean
  isThesis: boolean
} {
  return {
    isHoliday: t === "holiday",
    isSpeaker: t === "speaker",
    isThesis: t === "thesis",
  }
}

/** Kinds whose title is typed in, not derived from a reading-list paper. */
export function hasFreeFormTitle(t: MeetingType): boolean {
  return t === "speaker" || t === "thesis"
}

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  presentation: "報告",
  speaker: "演講",
  thesis: "碩論",
  holiday: "假日",
}
