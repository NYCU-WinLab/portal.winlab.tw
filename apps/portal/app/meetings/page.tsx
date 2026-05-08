"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { useMeetingsAdmin } from "@/hooks/meetings/use-meetings-admin"
import { useSyncMeetingFiles } from "@/hooks/meetings/use-meetings"

import { AddMeetingDialog } from "./_components/add-meeting-dialog"
import { AddPaperDialog } from "./_components/add-paper-dialog"
import { InfoTab } from "./_components/info-tab"
import { PapersTab } from "./_components/papers-tab"
import { ScheduleTab } from "./_components/schedule-tab"

const CURRENT_YEAR = new Date().getFullYear()

export default function MeetingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const year = Number(searchParams.get("year")) || CURRENT_YEAR
  const { isAdmin } = useMeetingsAdmin()

  const syncFiles = useSyncMeetingFiles()

  const [activeTab, setActiveTab] = useState("schedule")
  const [addMeetingOpen, setAddMeetingOpen] = useState(false)
  const [addPaperOpen, setAddPaperOpen] = useState(false)

  function setYear(y: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("year", String(y))
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">Lab Meetings</h1>
          <p className="text-sm text-muted-foreground">WinLab 每週報告排班</p>
        </div>
        {isAdmin && activeTab === "schedule" && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={syncFiles.isPending}
              onClick={() => syncFiles.mutate(year)}
            >
              {syncFiles.isPending ? "掃描中…" : "掃描檔案"}
            </Button>
            <Button size="sm" onClick={() => setAddMeetingOpen(true)}>
              新增週次
            </Button>
          </div>
        )}
        {isAdmin && activeTab === "papers" && (
          <Button size="sm" onClick={() => setAddPaperOpen(true)}>
            新增 Paper
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
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

      {isAdmin && (
        <>
          <AddMeetingDialog
            year={year}
            open={addMeetingOpen}
            onOpenChange={setAddMeetingOpen}
          />
          <AddPaperDialog open={addPaperOpen} onOpenChange={setAddPaperOpen} />
        </>
      )}
    </div>
  )
}
