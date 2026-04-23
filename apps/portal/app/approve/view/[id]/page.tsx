import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import type {
  ApproveDocument,
  ApproveField,
  ApproveSigner,
  SignerProfile,
} from "@/lib/approve/types"

import { DocumentView } from "../../_components/document-view"

export default async function ViewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = (await getCurrentUser())!
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from("approve_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!doc) notFound()

  const isCreator = doc.created_by === user.id
  let isSigner = false
  if (!isCreator) {
    const { data: my } = await supabase
      .from("approve_signers")
      .select("status")
      .eq("document_id", id)
      .eq("signer_id", user.id)
      .maybeSingle()
    if (!my) notFound()
    if (my.status === "pending") redirect(`/approve/sign/${id}`)
    isSigner = true
  }

  const [{ data: signers }, { data: fields }] = await Promise.all([
    supabase
      .from("approve_signers")
      .select(
        `id, document_id, signer_id, status, signed_at, created_at,
         profile:user_profiles!signer_id(
           id, name, email, member:members!inner(avatar_url, role)
         )`
      )
      .eq("document_id", id),
    supabase.from("approve_fields").select("*").eq("document_id", id),
  ])

  const withProfile: (ApproveSigner & { profile: SignerProfile | null })[] = (
    signers ?? []
  ).map((s) => {
    const row = s as typeof s & {
      id: string
      document_id: string
      signer_id: string
      status: "pending" | "signed"
      signed_at: string | null
      created_at: string
      profile?: {
        id: string
        name: string | null
        email: string | null
        member?: { avatar_url: string | null; role: string | null }
      } | null
    }
    return {
      id: row.id,
      document_id: row.document_id,
      signer_id: row.signer_id,
      status: row.status,
      signed_at: row.signed_at,
      created_at: row.created_at,
      profile: row.profile
        ? {
            id: row.profile.id,
            name: row.profile.name ?? row.profile.email ?? "Unknown",
            email: row.profile.email ?? null,
            avatar_url: row.profile.member?.avatar_url ?? null,
            role: row.profile.member?.role ?? null,
          }
        : null,
    }
  })

  return (
    <DocumentView
      document={doc as ApproveDocument}
      signers={withProfile}
      fields={(fields ?? []) as ApproveField[]}
      viewerRole={isCreator ? "creator" : isSigner ? "signer" : "creator"}
      viewerId={user.id}
    />
  )
}
