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
         profile:user_profiles!signer_id(id, name, email)`
      )
      .eq("document_id", id),
    supabase.from("approve_fields").select("*").eq("document_id", id),
  ])

  const profileRows = (signers ?? []).map((s) => {
    const row = s as typeof s & {
      signer_id: string
      profile?: {
        id: string
        name: string | null
        email: string | null
      } | null
    }
    return row
  })
  const signerIds = profileRows.map((r) => r.signer_id)

  const emails = profileRows
    .map((r) => r.profile?.email?.toLowerCase())
    .filter((e): e is string => !!e)
  const enrich = new Map<
    string,
    { avatar_url: string | null; role: string | null }
  >()
  if (emails.length) {
    const { data: members } = await supabase
      .from("members")
      .select("email, avatar_url, role")
      .in("email", emails)
    for (const m of members ?? []) {
      if (m.email)
        enrich.set(m.email.toLowerCase(), {
          avatar_url: m.avatar_url,
          role: m.role,
        })
    }
  }

  const profiles: SignerProfile[] = profileRows.map((r) => {
    const m = enrich.get(r.profile?.email?.toLowerCase() ?? "")
    return {
      id: r.profile?.id ?? r.signer_id,
      name: r.profile?.name ?? r.profile?.email ?? "Unknown",
      email: r.profile?.email ?? null,
      avatar_url: m?.avatar_url ?? null,
      role: m?.role ?? null,
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
