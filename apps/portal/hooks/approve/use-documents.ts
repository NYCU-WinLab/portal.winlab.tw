"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { ApproveDocument, ApproveSigner } from "@/lib/approve/types"

import { queryKeys } from "./query-keys"

type InboxRow = ApproveSigner & {
  document: ApproveDocument & {
    creator: { id: string; name: string | null; email: string | null } | null
  }
}

export function useInboxDocuments(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.documents.inbox(),
    enabled: !!userId,
    queryFn: async (): Promise<InboxRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("approve_signers")
        .select(
          `id, document_id, signer_id, status, signed_at, created_at,
           document:approve_documents(
             id, title, file_path, status, created_by, created_at, updated_at, completed_at,
             creator:user_profiles!created_by(id, name, email)
           )`
        )
        .eq("signer_id", userId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as InboxRow[]
    },
  })
}

export function useSignedDocuments(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.documents.signed(),
    enabled: !!userId,
    queryFn: async (): Promise<InboxRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("approve_signers")
        .select(
          `id, document_id, signer_id, status, signed_at, created_at,
           document:approve_documents(
             id, title, file_path, status, created_by, created_at, updated_at, completed_at,
             creator:user_profiles!created_by(id, name, email)
           )`
        )
        .eq("signer_id", userId!)
        .eq("status", "signed")
        .order("signed_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as InboxRow[]
    },
  })
}

export function useSentDocuments(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.documents.sent(),
    enabled: !!userId,
    queryFn: async (): Promise<ApproveDocument[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("approve_documents")
        .select("*")
        .eq("created_by", userId!)
        .order("updated_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ApproveDocument[]
    },
  })
}
