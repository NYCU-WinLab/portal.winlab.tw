"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthenticated")
  return user
}

export async function createDraft(): Promise<never> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("approve_documents")
    .insert({ title: "未命名", created_by: user.id })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create draft")
  }
  revalidatePath("/approve")
  redirect(`/approve/new/${data.id}`)
}
