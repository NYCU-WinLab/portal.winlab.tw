export const queryKeys = {
  availability: {
    range: (startDate: string, days: number) =>
      ["rooms", "availability", "range", startDate, days] as const,
  },
  portalBookings: {
    byDate: (date: string) => ["rooms", "portal-bookings", date] as const,
  },
}
