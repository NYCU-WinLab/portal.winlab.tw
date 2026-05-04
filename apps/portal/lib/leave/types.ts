export interface Leave {
  id: string
  user_id: string
  date: string
  reason: string
  created_at: string
  updated_at: string
}

export interface LeaveWithUser extends Leave {
  user: {
    name: string | null
  } | null
}
