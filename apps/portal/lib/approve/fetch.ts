import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  ApproveDocument,
  ApproveField,
  ApproveSigner,
} from "@/lib/approve/types"

export type DocumentCreator = {
  id: string
  name: string | null
  email: string | null
}

export type SignerDocumentRow = ApproveSigner & {
  document: ApproveDocument & { creator: DocumentCreator | null }
}

export type SignerWithProfile = ApproveSigner & {
  profile: DocumentCreator | null
}

const SIGNER_WITH_DOCUMENT = `id, document_id, signer_id, status, signed_at, created_at,
   document:approve_documents(
     id, title, file_path, status, created_by, created_at, updated_at, completed_at,
     creator:user_profiles!created_by(id, name, email)
   )`

// Shared by the approve dashboard hooks (browser client) and the MCP tools
// (per-request user client). RLS decides the rows either way: a member sees a
// document only when they created it or are one of its signers.
export async function fetchInboxDocuments(
  supabase: SupabaseClient,
  userId: string
): Promise<SignerDocumentRow[]> {
  const { data, error } = await supabase
    .from("approve_signers")
    .select(SIGNER_WITH_DOCUMENT)
    .eq("signer_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as SignerDocumentRow[]
}

export async function fetchSignedDocuments(
  supabase: SupabaseClient,
  userId: string
): Promise<SignerDocumentRow[]> {
  const { data, error } = await supabase
    .from("approve_signers")
    .select(SIGNER_WITH_DOCUMENT)
    .eq("signer_id", userId)
    .eq("status", "signed")
    .order("signed_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as SignerDocumentRow[]
}

export async function fetchSentDocuments(
  supabase: SupabaseClient,
  userId: string
): Promise<ApproveDocument[]> {
  const { data, error } = await supabase
    .from("approve_documents")
    .select("*")
    .eq("created_by", userId)
    .order("updated_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ApproveDocument[]
}

export async function fetchInboxCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("approve_signers")
    .select("id", { count: "exact", head: true })
    .eq("signer_id", userId)
    .eq("status", "pending")
  if (error) throw error
  return count ?? 0
}

export async function fetchDocument(
  supabase: SupabaseClient,
  documentId: string
): Promise<ApproveDocument | null> {
  const { data, error } = await supabase
    .from("approve_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle()
  if (error) throw error
  return (data as ApproveDocument | null) ?? null
}

// The creator sees every signer row; a signer only sees their own, because
// that is what approve_signers_select allows.
export async function fetchDocumentSigners(
  supabase: SupabaseClient,
  documentIds: string[]
): Promise<SignerWithProfile[]> {
  if (documentIds.length === 0) return []
  const { data, error } = await supabase
    .from("approve_signers")
    .select(
      `id, document_id, signer_id, status, signed_at, created_at,
       profile:user_profiles!signer_id(id, name, email)`
    )
    .in("document_id", documentIds)
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as SignerWithProfile[]
}

// Same split as the signers: the creator sees every field, a signer only the
// fields assigned to them.
export async function fetchDocumentFields(
  supabase: SupabaseClient,
  documentId: string
): Promise<ApproveField[]> {
  const { data, error } = await supabase
    .from("approve_fields")
    .select("*")
    .eq("document_id", documentId)
    .order("page", { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as ApproveField[]
}
