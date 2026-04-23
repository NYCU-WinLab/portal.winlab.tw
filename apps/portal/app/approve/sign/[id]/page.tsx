import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import type {
  ApproveDocument,
  ApproveField,
  ApproveUserFieldValue,
} from "@/lib/approve/types"

import { SigningView } from "../../_components/signing-view"

export default async function SignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = (await getCurrentUser())!
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from("approve_documents")
    .select("id,title,file_path,status")
    .eq("id", id)
    .maybeSingle()
  if (!doc) notFound()

  const { data: my } = await supabase
    .from("approve_signers")
    .select("id,status")
    .eq("document_id", id)
    .eq("signer_id", user.id)
    .maybeSingle()
  if (!my) notFound()
  if (my.status === "signed") redirect(`/approve/view/${id}`)

  const [{ data: fields }, { data: values }] = await Promise.all([
    supabase
      .from("approve_fields")
      .select("*")
      .eq("document_id", id)
      .eq("signer_id", user.id),
    supabase
      .from("approve_user_field_values")
      .select("*")
      .eq("user_id", user.id),
  ])

  return (
    <SigningView
      document={doc as ApproveDocument}
      fields={(fields ?? []) as ApproveField[]}
      savedValues={(values ?? []) as ApproveUserFieldValue[]}
    />
  )
}
