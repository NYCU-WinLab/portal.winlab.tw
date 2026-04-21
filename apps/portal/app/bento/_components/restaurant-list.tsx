"use client"

import { Search } from "lucide-react"
import { useState } from "react"

import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { useAdmin } from "@/hooks/bento/use-admin"
import { useMenus } from "@/hooks/bento/use-menus"

import { CreateRestaurantDialog } from "./create-restaurant-dialog"
import { RestaurantCard } from "./restaurant-card"

type RestaurantRow = {
  id: string
  name: string
  phone: string
  google_map_link?: string | null
  created_at: string
  additional?: string[] | null
}

export function RestaurantList() {
  const { isAdmin } = useAdmin()
  const { data: restaurants, isLoading } = useMenus()
  const [search, setSearch] = useState("")

  const filtered = ((restaurants ?? []) as RestaurantRow[]).filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading && !restaurants) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">Menus</h1>
          <p className="text-sm text-muted-foreground">店家列表與菜單管理。</p>
        </div>
        {isAdmin && <CreateRestaurantDialog />}
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜尋店家..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-col gap-3">
          {filtered.map((restaurant) => (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {search ? "找不到符合的店家" : "尚無店家"}
        </div>
      )}
    </div>
  )
}
