import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

export default async function NewDraftPage() {
  const user = (await getCurrentUser())!
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("approve_documents")
    .insert({ title: "未命名", created_by: user.id })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create draft")
  }
  redirect(`/approve/new/${data.id}`)
}
