"use client"

import { useRouter, useSearchParams } from "next/navigation"

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { InfoTab } from "./_components/info-tab"
import { PapersTab } from "./_components/papers-tab"
import { ScheduleTab } from "./_components/schedule-tab"

const CURRENT_YEAR = new Date().getFullYear()

export default function MeetingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const year = Number(searchParams.get("year")) || CURRENT_YEAR

  function setYear(y: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("year", String(y))
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-medium">Lab Meetings</h1>
        <p className="text-sm text-muted-foreground">WinLab 每週報告排班</p>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">排班表</TabsTrigger>
          <TabsTrigger value="papers">老師 Papers</TabsTrigger>
          <TabsTrigger value="info">Meeting 資訊</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="mt-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setYear(year - 1)}
              >
                <IconChevronLeft className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-sm font-medium tabular-nums">
                {year}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={year >= CURRENT_YEAR}
                onClick={() => setYear(year + 1)}
              >
                <IconChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <ScheduleTab year={year} />
          </div>
        </TabsContent>
        <TabsContent value="papers" className="mt-4">
          <PapersTab />
        </TabsContent>
        <TabsContent value="info" className="mt-4">
          <InfoTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
