"use client"

import {
  flexRender,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  reimburseTableFeatures,
  type ReimburseTableFeatures,
} from "@/lib/reimburse/table-features"

interface UnifiedTableProps<TData extends RowData> {
  columns: ColumnDef<ReimburseTableFeatures, TData>[]
  data: TData[]
}

export function UnifiedTable<TData extends RowData>({
  columns,
  data,
}: UnifiedTableProps<TData>) {
  const table = useTable({
    features: reimburseTableFeatures,
    data,
    columns,
  })

  return (
    <div className="w-full overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                沒有資料
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
