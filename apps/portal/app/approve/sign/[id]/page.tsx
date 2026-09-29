import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import {
  fetchDocument,
  fetchMyFields,
  fetchMySigner,
  fetchUserFieldValues,
} from "@/lib/approve/fetch"

import { SigningView } from "../../_components/signing-view"

export default async function SignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = (await getCurrentUser())!
  const supabase = await createClient()

  const doc = await fetchDocument(supabase, id)
  if (!doc) notFound()

  const my = await fetchMySigner(supabase, id, user.id)
  if (!my) notFound()
  if (my.status === "signed") redirect(`/approve/view/${id}`)

  const [fields, values] = await Promise.all([
    fetchMyFields(supabase, id, user.id),
    fetchUserFieldValues(supabase, user.id),
  ])

  return <SigningView document={doc} fields={fields} savedValues={values} />
}
