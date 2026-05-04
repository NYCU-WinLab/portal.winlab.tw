"use client"

import { useUserValues } from "./use-user-values"

export function useSavedSignature(userId: string | null) {
  const q = useUserValues(userId)
  const signature =
    q.data?.find((v) => v.category === "signature")?.value ?? null
  return { ...q, signature }
}
