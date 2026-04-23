export const queryKeys = {
  documents: {
    all: ["approve", "documents"] as const,
    inbox: (userId: string) =>
      [...queryKeys.documents.all, "inbox", userId] as const,
    signed: (userId: string) =>
      [...queryKeys.documents.all, "signed", userId] as const,
    sent: (userId: string) =>
      [...queryKeys.documents.all, "sent", userId] as const,
    detail: (id: string) => [...queryKeys.documents.all, id] as const,
  },
  signers: {
    all: ["approve", "signers"] as const,
    forDocument: (id: string) => [...queryKeys.signers.all, "doc", id] as const,
  },
  fields: {
    all: ["approve", "fields"] as const,
    forDocument: (id: string) => [...queryKeys.fields.all, "doc", id] as const,
  },
  userValues: {
    all: ["approve", "user-values"] as const,
    mine: (userId: string) => [...queryKeys.userValues.all, userId] as const,
  },
  inboxCount: (userId: string) => ["approve", "inbox-count", userId] as const,
}
