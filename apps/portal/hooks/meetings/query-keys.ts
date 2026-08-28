export const queryKeys = {
  meetings: {
    all: ["meetings", "schedule"] as const,
    byYear: (year: number) => ["meetings", "schedule", year] as const,
    years: ["meetings", "schedule", "years"] as const,
    // Nested *under* `all` on purpose: every schedule mutation already
    // invalidates `all` as a prefix, so minting a semester (產生整學期, or an
    // insert whose trigger derives a new one) refetches the semester list
    // without each mutation having to remember this key.
    semesters: ["meetings", "schedule", "semesters"] as const,
  },
  teacherPapers: {
    all: ["meetings", "teacher-papers"] as const,
  },
  paperAssignments: {
    all: ["meetings", "paper-assignments"] as const,
  },
  tags: {
    all: ["meetings", "tags"] as const,
  },
  admin: {
    status: ["meetings", "admin"] as const,
  },
  users: {
    all: ["meetings", "users"] as const,
  },
  questionPool: {
    all: ["meetings", "question-pool"] as const,
    members: ["meetings", "question-pool", "members"] as const,
  },
  presenterPool: {
    all: ["meetings", "presenter-pool"] as const,
  },
  questioners: {
    byYear: (year: number) => ["meetings", "questioners", year] as const,
  },
}
