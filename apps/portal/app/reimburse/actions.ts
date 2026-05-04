"use server"

import { revalidatePath } from "next/cache"

import {
  createEgress,
  deleteEgress,
  updateEgress,
} from "@/lib/reimburse/egress"
import { createIngress, updateIngress } from "@/lib/reimburse/ingress"
import type {
  InsertEgress,
  InsertIngress,
  UpdateEgress,
  UpdateIngress,
} from "@/lib/reimburse/types"

type ActionResult = { success: true } | { success: false; error: string }

function failure(error: unknown): ActionResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : "未知錯誤",
  }
}

// Mutations rely on RLS for authorization (is_reimburse_admin() in RLS
// policies). RLS rejecting the row is the source of truth — we surface the
// error to the toast instead of duplicating role checks here.

export async function addEgressAction(
  data: InsertEgress
): Promise<ActionResult> {
  try {
    await createEgress(data)
    revalidatePath("/reimburse")
    return { success: true }
  } catch (error) {
    console.error("[reimburse] addEgressAction failed", error)
    return failure(error)
  }
}

export async function updateEgressAction(
  id: string,
  data: UpdateEgress
): Promise<ActionResult> {
  try {
    await updateEgress(id, data)
    revalidatePath("/reimburse")
    return { success: true }
  } catch (error) {
    console.error("[reimburse] updateEgressAction failed", error)
    return failure(error)
  }
}

export async function deleteEgressAction(id: string): Promise<ActionResult> {
  try {
    await deleteEgress(id)
    revalidatePath("/reimburse")
    return { success: true }
  } catch (error) {
    console.error("[reimburse] deleteEgressAction failed", error)
    return failure(error)
  }
}

export async function addIngressAction(
  data: InsertIngress
): Promise<ActionResult> {
  try {
    await createIngress(data)
    revalidatePath("/reimburse")
    return { success: true }
  } catch (error) {
    console.error("[reimburse] addIngressAction failed", error)
    return failure(error)
  }
}

export async function updateIngressAction(
  id: string,
  data: UpdateIngress
): Promise<ActionResult> {
  try {
    await updateIngress(id, data)
    revalidatePath("/reimburse")
    return { success: true }
  } catch (error) {
    console.error("[reimburse] updateIngressAction failed", error)
    return failure(error)
  }
}
