export type TripStatus = "open" | "closed"

export interface Trip {
  id: string
  name: string
  description: string | null
  status: TripStatus
  created_by: string | null
  created_at: string
  closed_at: string | null
}

export interface TripFile {
  id: string
  trip_id: string
  user_id: string | null
  storage_path: string
  filename: string
  description: string | null
  size_bytes: number | null
  created_at: string
}

export interface TripFileWithUser extends TripFile {
  user: { id: string; name: string | null } | null
}
