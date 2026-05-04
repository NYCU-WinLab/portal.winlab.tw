export const queryKeys = {
  leaves: {
    all: ["leave", "leaves"] as const,
    list: () => [...queryKeys.leaves.all, "list"] as const,
  },
}
