"use client"

import { Pencil } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { useUpdateMenu } from "@/hooks/bento/use-menus"

import { MenuItemsEditor, type MenuItemDraft } from "./menu-items-editor"

interface Restaurant {
  id: string
  name: string
  phone: string
  google_map_link?: string | null
  additional?: string[] | null
}

interface MenuItemRow {
  id?: string
  name: string
  price: string | number
  type?: string | null
}

function toDraft(items: MenuItemRow[]): MenuItemDraft[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    price: String(item.price),
    type: item.type ?? "",
  }))
}

export function EditRestaurantDialog({
  restaurant,
  menuItems: existingMenuItems,
}: {
  restaurant: Restaurant
  menuItems: MenuItemRow[]
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(restaurant.name)
  const [phone, setPhone] = useState(restaurant.phone)
  const [googleMapLink, setGoogleMapLink] = useState(
    restaurant.google_map_link ?? ""
  )
  const [menuItems, setMenuItems] = useState<MenuItemDraft[]>(() =>
    toDraft(existingMenuItems)
  )
  const [additionalOptions, setAdditionalOptions] = useState<string[]>(
    restaurant.additional || []
  )
  const [newAdditionalOption, setNewAdditionalOption] = useState("")
  const updateMenu = useUpdateMenu(restaurant.id)

  useEffect(() => {
    if (open) {
      setName(restaurant.name)
      setPhone(restaurant.phone)
      setGoogleMapLink(restaurant.google_map_link ?? "")
      setMenuItems(toDraft(existingMenuItems))
      setAdditionalOptions(restaurant.additional || [])
    }
  }, [open, restaurant, existingMenuItems])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !phone) return

    try {
      await updateMenu.mutateAsync({
        name,
        phone,
        google_map_link: googleMapLink.trim() || null,
        menu_items: menuItems
          .filter((it) => it.name.trim() && it.price)
          .map((it) => ({
            id: it.id,
            name: it.name.trim(),
            price: it.price,
            type: it.type.trim() || null,
          })),
        additional: additionalOptions.length > 0 ? additionalOptions : null,
      })

      toast.success("店家已更新")
      setOpen(false)
    } catch (error) {
      const err = error instanceof Error ? error : new Error("更新失敗")
      toast.error(err.message)
    }
  }

  const addAdditional = () => {
    const trimmed = newAdditionalOption.trim()
    if (trimmed && !additionalOptions.includes(trimmed)) {
      setAdditionalOptions([...additionalOptions, trimmed])
      setNewAdditionalOption("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-1 h-3.5 w-3.5" />
          編輯
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>編輯店家</DialogTitle>
          <DialogDescription>更新店家資訊</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">店家名稱</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="google_map_link">Google 地圖連結（選填）</Label>
              <Input
                id="google_map_link"
                type="url"
                value={googleMapLink}
                onChange={(e) => setGoogleMapLink(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">電話</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>菜單品項</Label>
              <MenuItemsEditor items={menuItems} onChange={setMenuItems} />
            </div>
            <div className="space-y-2">
              <Label>自訂選項</Label>
              <div className="flex gap-2">
                <Input
                  value={newAdditionalOption}
                  onChange={(e) => setNewAdditionalOption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addAdditional()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addAdditional}>
                  新增
                </Button>
              </div>
              {additionalOptions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {additionalOptions.map((option, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-sm"
                    >
                      <span>{option}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setAdditionalOptions(
                            additionalOptions.filter((_, i) => i !== index)
                          )
                        }
                        className="ml-1 text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={updateMenu.isPending || !name || !phone}
            >
              {updateMenu.isPending ? "更新中..." : "更新"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
