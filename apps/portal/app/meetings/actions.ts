"use server"

import {
  admissionYearFromStudentId,
  parseAdmissionYear,
} from "@/lib/meetings/admission-year"
import { lookupAttributesByEmail } from "@/lib/profile/keycloak"
import { createClient } from "@/lib/supabase/server"

export type AdmissionYearSuggestion =
  | { status: "found"; year: number; source: "keycloak" | "student-id" }
  | { status: "unknown" }
  | { status: "forbidden" }

/**
 * Best guess at a member's 入學學年, for prefilling the presenter roster form.
 *
 * A suggestion, never an authority: most of the realm has no admissionYear at
 * all, so the form must stay usable when this returns nothing. That is also
 * why the roster stores the year itself rather than joining against Keycloak.
 */
export async function suggestAdmissionYear(
  userId: string
): Promise<AdmissionYearSuggestion> {
  const supabase = await createClient()

  // Reading another member's IdP attributes is an admin action. The RPCs that
  // consume the result check admin too, but this leaks on its own if it
  // doesn't check here.
  const { data: isAdmin } = await supabase.rpc("is_meetings_admin")
  if (isAdmin !== true) return { status: "forbidden" }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle()

  const email = profile?.email
  if (!email) return { status: "unknown" }

  const attributes = await lookupAttributesByEmail(email)
  if (!attributes) return { status: "unknown" }

  const declared = parseAdmissionYear(attributes.admissionYear?.[0])
  if (declared !== null)
    return { status: "found", year: declared, source: "keycloak" }

  // Falling back to the student ID covers the members whose admissionYear was
  // never filled in — the ID encodes the same year and is more widely present.
  const derived = admissionYearFromStudentId(attributes.student_id?.[0])
  if (derived !== null) {
    return { status: "found", year: derived, source: "student-id" }
  }

  return { status: "unknown" }
}
