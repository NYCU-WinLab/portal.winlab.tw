"use client"

import { useQuery } from "@tanstack/react-query"

import {
  fetchInboxDocuments,
  fetchSentDocuments,
  fetchSignedDocuments,
  type SignerDocumentRow,
} from "@/lib/approve/fetch"
import type { ApproveDocument } from "@/lib/approve/types"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useInboxDocuments(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.documents.inbox(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<SignerDocumentRow[]> =>
      fetchInboxDocuments(createClient(), userId!),
  })
}

export function useSignedDocuments(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.documents.signed(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<SignerDocumentRow[]> =>
      fetchSignedDocuments(createClient(), userId!),
  })
}

export function useSentDocuments(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.documents.sent(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<ApproveDocument[]> =>
      fetchSentDocuments(createClient(), userId!),
  })
}
