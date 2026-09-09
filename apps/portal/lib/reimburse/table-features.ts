import { tableFeatures } from "@tanstack/react-table"

/**
 * The reimburse table only renders rows — no sorting, filtering, pagination or
 * column visibility — so it registers no optional features. Table v9 gates APIs
 * on this object at the type level, which is why it lives here rather than
 * inside the table component: the column definitions need the same one, and two
 * separate `tableFeatures({})` calls would be two unrelated types.
 *
 * Registering `columnVisibilityFeature` here is a two-part change: the table
 * body renders `row.getAllCells()`, which is visibility-blind, while
 * `table.getHeaderGroups()` filters by visibility in v9 core whether or not the
 * feature is registered. They agree today only because nothing can hide a
 * column. Add the feature without switching the body back to
 * `row.getVisibleCells()` and the header loses a column that the rows keep —
 * silently, with no type or build error.
 */
export const reimburseTableFeatures = tableFeatures({})

export type ReimburseTableFeatures = typeof reimburseTableFeatures
