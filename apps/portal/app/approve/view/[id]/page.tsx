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
  if (!isCreator) {
    const { data: my, error: myErr } = await supabase
      .from("approve_signers")
      .select("status")
      .eq("document_id", id)
      .eq("signer_id", user.id)
      .maybeSingle()
    if (myErr) throw new Error(myErr.message)
    if (!my) notFound()
    if (my.status === "pending") redirect(`/approve/sign/${id}`)
  }

  const [{ data: signers }, { data: fields }] = await Promise.all([
    supabase
      .from("approve_signers")
      .select(
        `id, document_id, signer_id, status, signed_at, created_at,
         profile:user_profiles!signer_id(id, name, email)`
      )
      .eq("document_id", id),
    supabase.from("approve_fields").select("*").eq("document_id", id),
  ])

  const rows = (signers ?? []).map((s) => {
    return s as typeof s & {
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
      } | null
    }
  })

  const emails = rows
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

  const withProfile: (ApproveSigner & { profile: SignerProfile | null })[] =
    rows.map((row) => {
      const emailKey = row.profile?.email?.toLowerCase()
      const m = emailKey ? enrich.get(emailKey) : undefined
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
              avatar_url: m?.avatar_url ?? null,
              role: m?.role ?? null,
            }
          : null,
      }
    })

  return (
    <DocumentView
      document={doc as ApproveDocument}
      signers={withProfile}
      fields={(fields ?? []) as ApproveField[]}
      viewerRole={isCreator ? "creator" : "signer"}
      viewerId={user.id}
    />
  )
}
