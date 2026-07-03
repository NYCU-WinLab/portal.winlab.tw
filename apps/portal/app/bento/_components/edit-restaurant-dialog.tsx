"use client"

import { Pencil } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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

import {
  useRemoveMenuImage,
  useUpdateMenu,
  useUploadMenuImage,
} from "@/hooks/bento/use-menus"

import { MenuItemsEditor, type MenuItemDraft } from "./menu-items-editor"

interface Restaurant {
  id: string
  name: string
  phone: string
  google_map_link?: string | null
  additional?: string[] | null
  menu_image_url?: string | null
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
  const [menuImageUrl, setMenuImageUrl] = useState<string | null>(
    restaurant.menu_image_url ?? null
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updateMenu = useUpdateMenu(restaurant.id)
  const uploadImage = useUploadMenuImage(restaurant.id)
  const removeImage = useRemoveMenuImage(restaurant.id)

  useEffect(() => {
    if (open) {
      setName(restaurant.name)
      setPhone(restaurant.phone)
      setGoogleMapLink(restaurant.google_map_link ?? "")
      setMenuItems(toDraft(existingMenuItems))
      setAdditionalOptions(restaurant.additional || [])
      setMenuImageUrl(restaurant.menu_image_url ?? null)
    }
  }, [open, restaurant, existingMenuItems])

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadImage.mutateAsync(file)
      setMenuImageUrl(url)
      toast.success("菜單圖已上傳")
    } catch (error) {
      const err = error instanceof Error ? error : new Error("上傳失敗")
      toast.error(`上傳失敗：${err.message}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleImageRemove = async () => {
    try {
      await removeImage.mutateAsync()
      setMenuImageUrl(null)
      toast.success("菜單圖已移除")
    } catch (error) {
      const err = error instanceof Error ? error : new Error("移除失敗")
      toast.error(`移除失敗：${err.message}`)
    }
  }

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
              <Label>菜單圖片（選填）</Label>
              {menuImageUrl ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={menuImageUrl}
                    alt="菜單圖片"
                    className="max-h-48 w-full rounded-md border object-contain"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadImage.isPending}
                    >
                      {uploadImage.isPending ? "上傳中..." : "更換"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleImageRemove}
                      disabled={removeImage.isPending}
                    >
                      移除
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadImage.isPending}
                >
                  {uploadImage.isPending ? "上傳中..." : "上傳菜單圖"}
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
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
