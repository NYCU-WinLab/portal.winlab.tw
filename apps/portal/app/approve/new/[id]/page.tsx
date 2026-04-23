import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import type { ApproveField } from "@/lib/approve/types"

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

  const { data: fields } = await supabase
    .from("approve_fields")
    .select("*")
    .eq("document_id", id)

  return (
    <DocumentEditor
      documentId={id}
      initialTitle={doc.title}
      initialFilePath={doc.file_path}
      initialFields={(fields ?? []) as ApproveField[]}
    />
  )
}
