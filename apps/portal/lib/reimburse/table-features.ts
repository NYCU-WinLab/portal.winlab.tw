import { tableFeatures } from "@tanstack/react-table"

/**
 * The reimburse table only renders rows — no sorting, filtering, pagination or
 * column visibility — so it registers no optional features. Table v9 gates APIs
 * on this object at the type level, which is why it lives here rather than
 * inside the table component: the column definitions need the same one, and two
 * separate `tableFeatures({})` calls would be two unrelated types.
 */
export const reimburseTableFeatures = tableFeatures({})

export type ReimburseTableFeatures = typeof reimburseTableFeatures
