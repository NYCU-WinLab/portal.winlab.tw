// The body of GET /api/door/meeting: the next lab meeting as the door panel
// draws it before the Monday countdown. Names only, no ids, emails or links,
// because the panel is a public screen in the corridor.

import { normalizeGreetingName } from "@/lib/door/greetings"
import { MEETING_TYPE_LABELS, meetingType } from "@/lib/meetings/meeting-type"
import type { NextMeeting } from "@/lib/meetings/next"

export interface DoorMeeting {
  starts_at: string
  location: string
  type_label: string
  presenter: string | null
  questioners: string[]
  absent: string[]
}

export interface DoorLeave {
  user_id: string
}

const START_TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/

// meetings.start_time is free text (default '15:30') holding a Taipei wall
// clock time. Taiwan has no DST, so the offset is always +08:00.
export function taipeiStartsAt(date: string, startTime: string): string {
  const match = START_TIME.exec(startTime.trim())
  const [hour, minute, second = "00"] = match ? match.slice(1) : []
  if (!hour || !minute || Number(hour) > 23 || Number(minute) > 59) {
    throw new Error(`unreadable meeting start_time: ${startTime}`)
  }
  return `${date}T${hour.padStart(2, "0")}:${minute}:${second}+08:00`
}

// The profile name wins because it is the member's current name; the
// snapshot on the row is what was typed when the week was assigned.
export function doorDisplayName(
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const candidate of candidates) {
    const name = candidate ? normalizeGreetingName(candidate) : ""
    if (name) return name
  }
  return null
}

export function buildDoorMeeting(
  next: NextMeeting,
  leaves: DoorLeave[],
  profileNames: Map<string, string | null>
): DoorMeeting {
  const { meeting, questioners } = next
  const nameOf = (userId: string | null, snapshot?: string | null) =>
    doorDisplayName(userId ? profileNames.get(userId) : null, snapshot)
  const names = (list: (string | null)[]) =>
    list.filter((name): name is string => name !== null)

  return {
    starts_at: taipeiStartsAt(meeting.scheduledDate, meeting.startTime),
    location: meeting.location,
    type_label: MEETING_TYPE_LABELS[meetingType(meeting)],
    presenter: nameOf(meeting.presenterUserId, meeting.presenter),
    questioners: names(questioners.map((q) => nameOf(q.userId, q.name))),
    absent: names(leaves.map((leave) => nameOf(leave.user_id))),
  }
}
