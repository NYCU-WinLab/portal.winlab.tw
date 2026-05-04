export const queryKeys = {
  receipts: {
    all: ["receipts", "list"] as const,
  },
  admin: {
    status: ["receipts", "admin"] as const,
  },
  signedUrl: (path: string) => ["receipts", "signed-url", path] as const,
}
