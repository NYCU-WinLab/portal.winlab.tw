export interface Room {
  name: string
  capacity: number
  /** NT$/hour. Rooms with charge 0 are the ones worth surfacing first. */
  charge: number
  active: boolean
}

/** A booked window for one room, in UTC ISO timestamps. */
export interface BusySlot {
  room: string
  start: string
  end: string
}
