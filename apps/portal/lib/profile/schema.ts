// Pure validation for a portal user editing their OWN Keycloak profile.
//
// This whitelist is a security boundary: it is the only thing standing
// between "the user typed something in a form" and "we PUT it into
// Keycloak's user representation". `role`, `username`, `is_admin`, `email`
// etc. are intentionally absent — accepting them here would let a caller
// smuggle privilege changes through a profile-edit endpoint. Keep this list
// exhaustive; adding a field to Keycloak's editable set means adding it
// here first, deliberately.

export const EDITABLE_PROFILE_FIELDS = [
  "chinese_name",
  "firstName",
  "lastName",
  "phone",
  "position",
  "gitlabUsername",
  "student_id",
] as const

export type EditableProfileField = (typeof EDITABLE_PROFILE_FIELDS)[number]

export type ProfileUpdate = Partial<Record<EditableProfileField, string>>

const EDITABLE_FIELD_SET: ReadonlySet<string> = new Set(EDITABLE_PROFILE_FIELDS)

const CONTROL_CHARS = /[\x00-\x1F\x7F]/
// Keycloak rejects these characters in person names (firstName / lastName).
const NAME_PROHIBITED_CHARS = /[<>&"$%!#?§,;:]/
const PHONE_CHARS = /^[0-9+\-() ]+$/
const PHONE_HAS_DIGIT = /\d/
// Must start with a letter, digit, or underscore; the rest may also use
// '-' and '.'. The ".." / trailing "." rules are checked separately below.
const GITLAB_USERNAME_CHARS = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/
// [班別1][入學學年2][系所3][流水號3], e.g. 313552013
const STUDENT_ID_FORMAT = /^\d{9}$/

export type FieldResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

function validateChineseName(value: string): FieldResult {
  if (value.length === 0) return { ok: false, error: "must not be empty" }
  if (value.length > 50)
    return { ok: false, error: "must be at most 50 characters" }
  if (CONTROL_CHARS.test(value))
    return { ok: false, error: "must not contain control characters" }
  return { ok: true, value }
}

function validatePersonName(value: string): FieldResult {
  if (value.length === 0) return { ok: false, error: "must not be empty" }
  if (value.length > 255)
    return { ok: false, error: "must be at most 255 characters" }
  if (CONTROL_CHARS.test(value))
    return { ok: false, error: "must not contain control characters" }
  if (NAME_PROHIBITED_CHARS.test(value))
    return { ok: false, error: "contains a prohibited character" }
  return { ok: true, value }
}

function validatePhone(value: string): FieldResult {
  if (value.length === 0) return { ok: true, value }
  if (value.length > 30)
    return { ok: false, error: "must be at most 30 characters" }
  if (!PHONE_CHARS.test(value))
    return {
      ok: false,
      error: "must contain only digits, spaces, +, -, ( and )",
    }
  if (!PHONE_HAS_DIGIT.test(value))
    return { ok: false, error: "must contain at least one digit" }
  return { ok: true, value }
}

function validatePosition(value: string): FieldResult {
  if (value.length === 0) return { ok: true, value }
  if (value.length > 100)
    return { ok: false, error: "must be at most 100 characters" }
  if (CONTROL_CHARS.test(value))
    return { ok: false, error: "must not contain control characters" }
  return { ok: true, value }
}

function validateGitlabUsername(value: string): FieldResult {
  if (value.length === 0) return { ok: true, value }
  if (value.length > 255)
    return { ok: false, error: "must be at most 255 characters" }
  if (!GITLAB_USERNAME_CHARS.test(value))
    return {
      ok: false,
      error:
        "must start with a letter, digit, or underscore and contain only letters, digits, '_', '-' or '.'",
    }
  if (value.endsWith(".")) return { ok: false, error: "must not end with '.'" }
  if (value.includes(".."))
    return { ok: false, error: "must not contain consecutive dots" }
  return { ok: true, value }
}

function validateStudentId(value: string): FieldResult {
  if (value.length === 0) return { ok: true, value }
  if (!STUDENT_ID_FORMAT.test(value))
    return { ok: false, error: "must be exactly 9 digits" }
  return { ok: true, value }
}

export function validateField(
  key: EditableProfileField,
  value: string
): FieldResult {
  switch (key) {
    case "chinese_name":
      return validateChineseName(value)
    case "firstName":
    case "lastName":
      return validatePersonName(value)
    case "phone":
      return validatePhone(value)
    case "position":
      return validatePosition(value)
    case "gitlabUsername":
      return validateGitlabUsername(value)
    case "student_id":
      return validateStudentId(value)
  }
}

export function validateProfileUpdate(
  input: Record<string, unknown>
):
  | { ok: true; value: ProfileUpdate }
  | { ok: false; errors: Record<string, string> } {
  // Null-prototype: on a plain object literal, errors["__proto__"] = "…" hits
  // the inherited setter instead of creating an own property, so a payload
  // whose only bad key is __proto__ would count zero errors and pass.
  const errors = Object.create(null) as Record<string, string>
  const value: ProfileUpdate = {}

  for (const key of Object.keys(input)) {
    if (!EDITABLE_FIELD_SET.has(key)) {
      errors[key] = "unknown field"
      continue
    }

    const raw = input[key]
    if (typeof raw !== "string") {
      errors[key] = "must be a string"
      continue
    }

    const field = key as EditableProfileField
    const trimmed = raw.trim()
    const result = validateField(field, trimmed)
    if (result.ok) {
      value[field] = result.value
    } else {
      errors[key] = result.error
    }
  }

  if (Object.keys(errors).length > 0) {
    // Spread back onto a normal object — this crosses the Server Action
    // boundary and a null-prototype object has no business being serialized.
    return { ok: false, errors: { ...errors } }
  }
  return { ok: true, value }
}
