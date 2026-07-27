export const queryKeys = {
  availability: {
    byDate: (date: string) => ["rooms", "availability", date] as const,
  },
}
