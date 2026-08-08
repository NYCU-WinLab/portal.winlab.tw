export const queryKeys = {
  availability: {
    range: (startDate: string, days: number) =>
      ["rooms", "availability", "range", startDate, days] as const,
  },
  portalBookings: {
    byDate: (date: string) => ["rooms", "portal-bookings", date] as const,
  },
  onlineBookings: {
    all: ["rooms", "online-bookings"] as const,
  },
  labUsers: {
    all: ["rooms", "lab-users"] as const,
  },
  attendeeGroups: {
    all: ["rooms", "attendee-groups"] as const,
  },
  groupEpics: {
    byGroup: (groupName: string) =>
      ["rooms", "group-epics", groupName] as const,
  },
  recurring: {
    all: ["rooms", "recurring"] as const,
  },
}
