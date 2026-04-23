import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import type { ApproveField, SignerProfile } from "@/lib/approve/types"

import { DocumentEditor } from "../../_components/document-editor"

export default async function EditDraftPage({
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
    .eq("created_by", user.id)
    .maybeSingle()
  if (!doc) notFound()
  if (doc.status !== "draft") notFound()

  const [{ data: signers }, { data: fields }] = await Promise.all([
    supabase
      .from("approve_signers")
      .select(
        `signer_id,
         profile:user_profiles!signer_id(
           id, name, email, member:members!inner(avatar_url, role)
         )`
      )
      .eq("document_id", id),
    supabase.from("approve_fields").select("*").eq("document_id", id),
  ])

  const signerIds = (signers ?? []).map((s) => {
    const row = s as typeof s & { signer_id: string }
    return row.signer_id
  })
  const profiles: SignerProfile[] = (signers ?? []).map((s) => {
    const row = s as typeof s & {
      signer_id: string
      profile?: {
        id: string
        name: string | null
        email: string | null
        member?: { avatar_url: string | null; role: string | null }
      } | null
    }
    return {
      id: row.profile?.id ?? row.signer_id,
      name: row.profile?.name ?? row.profile?.email ?? "Unknown",
      email: row.profile?.email ?? null,
      avatar_url: row.profile?.member?.avatar_url ?? null,
      role: row.profile?.member?.role ?? null,
    }
  })

  return (
    <DocumentEditor
      documentId={id}
      initialTitle={doc.title}
      initialFilePath={doc.file_path}
      initialSignerIds={signerIds}
      initialFields={(fields ?? []) as ApproveField[]}
      initialSignerProfiles={profiles}
    />
  )
}
