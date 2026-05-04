"use client"

import { useState } from "react"
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
import { Textarea } from "@workspace/ui/components/textarea"

import { useCreateTrip } from "@/hooks/trip/use-trips"

export function CreateTripDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const createTrip = useCreateTrip()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await createTrip.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      toast.success("已建立")
      setOpen(false)
      setName("")
      setDescription("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "建立失敗")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">新增 Trip</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增 Trip</DialogTitle>
          <DialogDescription>給這個出差一個名字。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="trip-name">名稱</Label>
              <Input
                id="trip-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：2026 ICRA 橫濱"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trip-desc">說明（選填）</Label>
              <Textarea
                id="trip-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="日期、補助上限、特別說明…"
                rows={3}
              />
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
              disabled={createTrip.isPending || !name.trim()}
            >
              {createTrip.isPending ? "建立中..." : "建立"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
