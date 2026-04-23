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
  const { data } = await supabase
    .from("approve_documents")
    .select("*")
    .eq("id", id)
    .eq("created_by", user.id)
    .maybeSingle()
  if (!data) notFound()
  if (data.status !== "draft") notFound()

  return (
    <DocumentEditor
      documentId={id}
      initialTitle={data.title}
      initialFilePath={data.file_path}
    />
  )
}
