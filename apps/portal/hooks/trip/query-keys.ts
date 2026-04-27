export const queryKeys = {
  trips: {
    all: ["trip", "trips"] as const,
    list: () => [...queryKeys.trips.all, "list"] as const,
    detail: (id: string) => [...queryKeys.trips.all, id] as const,
  },
  files: {
    all: ["trip", "files"] as const,
    byTrip: (tripId: string) =>
      [...queryKeys.files.all, "byTrip", tripId] as const,
  },
  admin: {
    status: ["trip", "admin"] as const,
  },
}
