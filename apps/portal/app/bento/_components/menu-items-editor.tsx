"use client"

import { Plus, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

export type MenuItemDraft = {
  id?: string
  name: string
  price: string
  type: string
}

export function createEmptyItem(): MenuItemDraft {
  return { name: "", price: "", type: "" }
}

export function MenuItemsEditor({
  items,
  onChange,
}: {
  items: MenuItemDraft[]
  onChange: (items: MenuItemDraft[]) => void
}) {
  const update = (index: number, patch: Partial<MenuItemDraft>) => {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const add = () => {
    onChange([...items, createEmptyItem()])
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <div className="flex flex-col divide-y rounded-lg border border-border bg-card">
          {items.map((item, index) => (
            <div
              key={item.id ?? `new-${index}`}
              className="flex items-center gap-2 px-3 py-2"
            >
              <Input
                placeholder="品名"
                value={item.name}
                onChange={(e) => update(index, { name: e.target.value })}
                className="flex-1"
              />
              <Input
                placeholder="價格"
                type="number"
                inputMode="numeric"
                value={item.price}
                onChange={(e) => update(index, { price: e.target.value })}
                className="w-24"
              />
              <Input
                placeholder="類型（選填）"
                value={item.type}
                onChange={(e) => update(index, { type: e.target.value })}
                className="w-32"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="刪除品項"
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        className="self-start"
      >
        <Plus className="mr-1 size-3.5" />
        新增品項
      </Button>
    </div>
  )
}
