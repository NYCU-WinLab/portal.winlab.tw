export const queryKeys = {
  documents: {
    all: ["approve", "documents"] as const,
    inbox: () => [...queryKeys.documents.all, "inbox"] as const,
    signed: () => [...queryKeys.documents.all, "signed"] as const,
    sent: () => [...queryKeys.documents.all, "sent"] as const,
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
    mine: () => [...queryKeys.userValues.all, "me"] as const,
  },
  inboxCount: ["approve", "inbox-count"] as const,
}
