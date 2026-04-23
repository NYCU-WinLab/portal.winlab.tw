import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

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

  const { data: signers } = await supabase
    .from("approve_signers")
    .select("signer_id")
    .eq("document_id", id)

  return (
    <DocumentEditor
      documentId={id}
      initialTitle={doc.title}
      initialFilePath={doc.file_path}
      initialSignerIds={(signers ?? []).map((s) => s.signer_id)}
    />
  )
}
