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

// A mangled link from an invite mail is a page that does not exist, not a
// failure worth retrying, so it never reaches the database.
const DOCUMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function SignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!DOCUMENT_ID.test(id)) notFound()
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
