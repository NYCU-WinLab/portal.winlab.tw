"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import type { FieldCategory } from "@/lib/approve/types"
import { validateForSubmit } from "@/lib/approve/validation"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"
import { isPredefined } from "@/lib/approve/field-categories"

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthenticated")
  return user
}

export async function uploadPdf(formData: FormData): Promise<void> {
  const user = await requireUser()
  const documentId = formData.get("documentId")
  const file = formData.get("file")
  if (typeof documentId !== "string" || !(file instanceof File)) {
    throw new Error("bad payload")
  }
  if (file.size > 50 * 1024 * 1024) throw new Error("PDF too large (>50MB)")

  const supabase = await createClient()
  const { data: doc, error: docErr } = await supabase
    .from("approve_documents")
    .select("id,status")
    .eq("id", documentId)
    .eq("created_by", user.id)
    .maybeSingle()
  if (docErr) throw new Error(docErr.message)
  if (!doc) throw new Error("document not found")
  if (doc.status !== "draft") throw new Error("only drafts can re-upload")

  const path = documentStoragePath(documentId)
  const { error: upErr } = await supabase.storage
    .from(APPROVE_BUCKET)
    .upload(path, file, { upsert: true, contentType: "application/pdf" })
  if (upErr) throw new Error(upErr.message)

  const { error: updErr } = await supabase
    .from("approve_documents")
    .update({ file_path: path })
    .eq("id", documentId)
    .eq("created_by", user.id)
  if (updErr) throw new Error(updErr.message)

  revalidatePath(`/approve/new/${documentId}`)
}

export async function updateDocumentTitle(
  documentId: string,
  title: string
): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from("approve_documents")
    .update({ title })
    .eq("id", documentId)
    .eq("created_by", user.id)
    .eq("status", "draft")
  if (error) throw new Error(error.message)
}

export type UpsertFieldInput = {
  id: string
  documentId: string
  signerId: string | null
  page: number
  x: number
  y: number
  width: number
  height: number
  category: FieldCategory
  label?: string | null
}

export async function upsertField(input: UpsertFieldInput): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: doc, error: docErr } = await supabase
    .from("approve_documents")
    .select("id")
    .eq("id", input.documentId)
    .eq("created_by", user.id)
    .eq("status", "draft")
    .maybeSingle()
  if (docErr) throw new Error(docErr.message)
  if (!doc) throw new Error("document not editable")

  // Register the signer on the doc FIRST so a crash between the two writes
  // never leaves a field referencing a signer that isn't in the inbox list.
  if (input.signerId) {
    const { error: signerErr } = await supabase
      .from("approve_signers")
      .upsert(
        { document_id: input.documentId, signer_id: input.signerId },
        { onConflict: "document_id,signer_id", ignoreDuplicates: true }
      )
    if (signerErr) throw new Error(signerErr.message)
  }

  const { error } = await supabase.from("approve_fields").upsert({
    id: input.id,
    document_id: input.documentId,
    signer_id: input.signerId,
    page: input.page,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    category: input.category,
    label: input.label ?? null,
  })
  if (error) throw new Error(error.message)
}

// Prune approve_signers rows that no longer have any field assigned to them.
// Called after a field's signer is reassigned or a field is removed.
export async function syncSigners(documentId: string): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: doc, error: docErr } = await supabase
    .from("approve_documents")
    .select("id")
    .eq("id", documentId)
    .eq("created_by", user.id)
    .eq("status", "draft")
    .maybeSingle()
  if (docErr) throw new Error(docErr.message)
  if (!doc) return

  const { data: fields, error: fieldsErr } = await supabase
    .from("approve_fields")
    .select("signer_id")
    .eq("document_id", documentId)
    .not("signer_id", "is", null)
  if (fieldsErr) throw new Error(fieldsErr.message)
  const stillUsed = new Set(
    (fields ?? []).map((f) => f.signer_id).filter((id): id is string => !!id)
  )

  const { data: signers, error: signersErr } = await supabase
    .from("approve_signers")
    .select("signer_id")
    .eq("document_id", documentId)
  if (signersErr) throw new Error(signersErr.message)

  const toRemove = (signers ?? [])
    .map((s) => s.signer_id)
    .filter((id) => !stillUsed.has(id))

  if (toRemove.length) {
    const { error } = await supabase
      .from("approve_signers")
      .delete()
      .eq("document_id", documentId)
      .in("signer_id", toRemove)
    if (error) throw new Error(error.message)
  }
}

export async function deleteField(
  documentId: string,
  fieldId: string
): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: doc, error: docErr } = await supabase
    .from("approve_documents")
    .select("id")
    .eq("id", documentId)
    .eq("created_by", user.id)
    .eq("status", "draft")
    .maybeSingle()
  if (docErr) throw new Error(docErr.message)
  if (!doc) throw new Error("document not editable")

  const { error } = await supabase
    .from("approve_fields")
    .delete()
    .eq("id", fieldId)
    .eq("document_id", documentId)
  if (error) throw new Error(error.message)
}

export async function submitDocument(documentId: string): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const [docRes, fieldsRes] = await Promise.all([
    supabase
      .from("approve_documents")
      .select("id,title,file_path,status,created_by")
      .eq("id", documentId)
      .eq("created_by", user.id)
      .maybeSingle(),
    supabase.from("approve_fields").select("*").eq("document_id", documentId),
  ])
  if (docRes.error) throw new Error(docRes.error.message)
  if (fieldsRes.error) throw new Error(fieldsRes.error.message)
  const doc = docRes.data
  const fields = fieldsRes.data
  if (!doc) throw new Error("document not found")
  if (doc.status !== "draft") throw new Error("not a draft")

  const v = validateForSubmit({
    title: doc.title,
    filePath: doc.file_path,
    fields: (fields ?? []) as never,
  })
  if (!v.ok) throw new Error(v.reason)

  const { error } = await supabase
    .from("approve_documents")
    .update({ status: "pending" })
    .eq("id", documentId)
    .eq("created_by", user.id)
    .eq("status", "draft")
  if (error) throw new Error(error.message)

  revalidatePath("/approve")
  revalidatePath(`/approve/new/${documentId}`)
  // Client navigates after this returns — don't redirect here, otherwise
  // the client's try/catch treats NEXT_REDIRECT as a real error.
}

export type SignatureValue = { fieldId: string; value: string }

export async function submitSignature(
  documentId: string,
  values: SignatureValue[]
): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: my, error: myErr } = await supabase
    .from("approve_signers")
    .select("id,status")
    .eq("document_id", documentId)
    .eq("signer_id", user.id)
    .maybeSingle()
  if (myErr) throw new Error(myErr.message)
  if (!my) throw new Error("you are not a signer")
  if (my.status === "signed") throw new Error("already signed")

  const { data: myFields, error: myFieldsErr } = await supabase
    .from("approve_fields")
    .select("id,category")
    .eq("document_id", documentId)
    .eq("signer_id", user.id)
  if (myFieldsErr) throw new Error(myFieldsErr.message)
  if (!myFields || myFields.length === 0) {
    throw new Error("no fields assigned to you")
  }

  const byId = new Map(values.map((v) => [v.fieldId, v.value]))
  for (const f of myFields) {
    const v = byId.get(f.id)
    if (!v || !v.trim()) throw new Error("all fields must be filled")
  }

  const now = new Date().toISOString()
  for (const f of myFields) {
    const v = byId.get(f.id)!
    const { error } = await supabase
      .from("approve_fields")
      .update({ value: v, signed_at: now })
      .eq("id", f.id)
      .eq("signer_id", user.id)
    if (error) throw new Error(error.message)
  }

  // Persist predefined values for future pre-fill
  const upserts = myFields
    .filter((f) => isPredefined(f.category as FieldCategory))
    .map((f) => ({
      user_id: user.id,
      category: f.category,
      value: byId.get(f.id)!,
      updated_at: now,
    }))
  if (upserts.length) {
    const { error } = await supabase
      .from("approve_user_field_values")
      .upsert(upserts, { onConflict: "user_id,category" })
    if (error) throw new Error(error.message)
  }

  const { error: signerUpdateErr } = await supabase
    .from("approve_signers")
    .update({ status: "signed", signed_at: now })
    .eq("id", my.id)
  if (signerUpdateErr) throw new Error(signerUpdateErr.message)

  const { count, error: countErr } = await supabase
    .from("approve_signers")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .eq("status", "pending")
  if (countErr) throw new Error(countErr.message)
  if ((count ?? 0) === 0) {
    const { error: completeErr } = await supabase
      .from("approve_documents")
      .update({ status: "completed", completed_at: now })
      .eq("id", documentId)
    if (completeErr) throw new Error(completeErr.message)
  }

  revalidatePath("/approve")
  // Client navigates after this returns — same reason as submitDocument.
}

export async function deleteDocument(documentId: string): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from("approve_documents")
    .delete()
    .eq("id", documentId)
    .eq("created_by", user.id)
    .in("status", ["draft", "pending", "cancelled"])
  if (error) throw new Error(error.message)
  revalidatePath("/approve")
}
