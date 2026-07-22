"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  MEETING_TYPE_LABELS,
  type MeetingType,
} from "@/lib/meetings/meeting-type"

interface Props {
  value: MeetingType
  onValueChange: (type: MeetingType) => void
}

// Shared 報告 / 演講 / 假日 picker for the add- and edit-meeting dialogs, so the
// option list and labels can't drift between the two (mirrors PresenterSelect /
// PaperSelect living in this folder).
export function MeetingTypeSelect({ value, onValueChange }: Props) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as MeetingType)}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="presentation">
          {MEETING_TYPE_LABELS.presentation}
        </SelectItem>
        <SelectItem value="speaker">
          {MEETING_TYPE_LABELS.speaker}(外部講者)
        </SelectItem>
        <SelectItem value="holiday">
          {MEETING_TYPE_LABELS.holiday} / 暫停
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
