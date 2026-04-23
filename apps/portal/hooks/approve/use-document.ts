"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type {
  ApproveDocument,
  ApproveField,
  ApproveSigner,
  SignerProfile,
} from "@/lib/approve/types"

import { queryKeys } from "./query-keys"

export type DocumentBundle = {
  document: ApproveDocument
  signers: (ApproveSigner & { profile: SignerProfile | null })[]
  fields: ApproveField[]
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: queryKeys.documents.detail(id),
    queryFn: async (): Promise<DocumentBundle> => {
      const supabase = createClient()
      const [doc, signers, fields] = await Promise.all([
        supabase.from("approve_documents").select("*").eq("id", id).single(),
        supabase
          .from("approve_signers")
          .select(
            `id, document_id, signer_id, status, signed_at, created_at,
             profile:user_profiles!signer_id(
               id, name, email,
               member:members!inner(avatar_url, role)
             )`
          )
          .eq("document_id", id),
        supabase.from("approve_fields").select("*").eq("document_id", id),
      ])
      if (doc.error) throw doc.error
      if (signers.error) throw signers.error
      if (fields.error) throw fields.error

      return {
        document: doc.data as ApproveDocument,
        signers: (signers.data ?? []).map((row: any) => ({
          ...row,
          profile: row.profile
            ? {
                id: row.profile.id,
                name: row.profile.name ?? row.profile.email ?? "Unknown",
                email: row.profile.email ?? null,
                avatar_url: row.profile.member?.avatar_url ?? null,
                role: row.profile.member?.role ?? null,
              }
            : null,
        })),
        fields: (fields.data ?? []) as ApproveField[],
      }
    },
  })
}
