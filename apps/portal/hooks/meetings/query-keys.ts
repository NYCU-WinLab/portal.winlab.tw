export const queryKeys = {
  meetings: {
    all: ["meetings", "schedule"] as const,
    byYear: (year: number) => ["meetings", "schedule", year] as const,
  },
  teacherPapers: {
    all: ["meetings", "teacher-papers"] as const,
  },
  admin: {
    status: ["meetings", "admin"] as const,
  },
  users: {
    all: ["meetings", "users"] as const,
  },
  groups: {
    all: ["meeting_groups"] as const,
  },
}
