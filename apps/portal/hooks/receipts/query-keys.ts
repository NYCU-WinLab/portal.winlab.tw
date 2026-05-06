export const queryKeys = {
  receipts: {
    all: ["receipts", "list"] as const,
  },
  tags: {
    all: ["receipts", "tags"] as const,
  },
  admin: {
    status: ["receipts", "admin"] as const,
  },
  signedUrl: (path: string) => ["receipts", "signed-url", path] as const,
}
