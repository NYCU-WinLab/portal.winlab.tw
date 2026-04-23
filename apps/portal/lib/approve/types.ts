export type DocumentStatus = "draft" | "pending" | "completed" | "cancelled"
export type SignerStatus = "pending" | "signed"

export type FieldCategory =
  | "signature"
  | "contact_address"
  | "household_address"
  | "id_number"
  | "phone"
  | "other"

export type PredefinedCategory = Exclude<FieldCategory, "other">

export type ApproveDocument = {
  id: string
  title: string
  file_path: string | null
  status: DocumentStatus
  created_by: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export type ApproveSigner = {
  id: string
  document_id: string
  signer_id: string
  status: SignerStatus
  signed_at: string | null
  created_at: string
}

export type ApproveField = {
  id: string
  document_id: string
  signer_id: string
  page: number
  x: number
  y: number
  width: number
  height: number
  category: FieldCategory
  label: string | null
  value: string | null
  signed_at: string | null
  created_at: string
}

export type ApproveUserFieldValue = {
  id: string
  user_id: string
  category: PredefinedCategory
  value: string
  updated_at: string
}

export type SignerProfile = {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  role: string | null
}
